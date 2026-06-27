// DynamoDB-backed vector store for TollRoad track embeddings.
//
// Stored in the EXISTING single table (TOLLROAD_TABLE). Item shape:
//   PK = "TVEC", SK = <trackId>
//   embedding: List of Number (1024-dim Titan v2 vector, normalised)
//   updatedAt: ISO-8601 string
//
// All vectors share PK="TVEC" — one partition, fine at demo scale. Mirrors the
// lazy-init DynamoDB doc-client pattern from domain/wallet-store.ts exactly.
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.TOLLROAD_TABLE;

/** True when the DynamoDB table is configured — mirrors walletStoreConfigured(). */
export function vectorConfigured(): boolean {
  return Boolean(TABLE);
}

// Lazily import the SDK and reuse one client across warm invocations (same posture
// as domain/wallet-store.ts). The Node 20 Lambda runtime ships @aws-sdk/*,
// so it isn't bundled.
let sdk: Promise<typeof import("@aws-sdk/client-dynamodb")> | null = null;
let client: import("@aws-sdk/client-dynamodb").DynamoDBClient | null = null;

async function getSdk() {
  if (!sdk) sdk = import("@aws-sdk/client-dynamodb");
  const m = await sdk;
  if (!client) client = new m.DynamoDBClient({ region: REGION });
  return { client, m };
}

/** Write (upsert) a track embedding into the TVEC partition. */
export async function putTrackVector(trackId: string, embedding: number[]): Promise<void> {
  if (!TABLE) throw new Error("TOLLROAD_TABLE is not set");
  const { client, m } = await getSdk();
  await client.send(
    new m.PutItemCommand({
      TableName: TABLE,
      Item: {
        PK: { S: "TVEC" },
        SK: { S: trackId },
        embedding: { L: embedding.map((n) => ({ N: String(n) })) },
        updatedAt: { S: new Date().toISOString() },
      },
    }),
  );
}

/** Fetch all stored track vectors, paginating across LastEvaluatedKey. */
export async function getAllTrackVectors(): Promise<Array<{ trackId: string; embedding: number[] }>> {
  if (!TABLE) return [];
  const { client, m } = await getSdk();
  const results: Array<{ trackId: string; embedding: number[] }> = [];
  let lastKey: Record<string, AttributeValue> | undefined;

  do {
    const res = await client.send(
      new m.QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: "TVEC" } },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      const trackId = item.SK?.S ?? "";
      const embedding = (item.embedding?.L ?? []).map((v) => Number(v.N ?? 0));
      if (trackId) results.push({ trackId, embedding });
    }
    lastKey = res.LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);

  return results;
}
