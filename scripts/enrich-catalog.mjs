// Catalog embedding backfill — reads every track from Aurora DSQL,
// builds a text descriptor, embeds it with Amazon Bedrock Titan v2,
// and writes the vector into the DynamoDB single-table (TVEC partition).
//
// Idempotent: DynamoDB PutItem overwrites any existing item — safe to re-run.
//
// Usage:
//   TOLLROAD_DSQL_ENDPOINT=<endpoint>   \
//   TOLLROAD_TABLE=<dynamodb-table>     \
//   [TOLLROAD_DSQL_REGION=us-east-1]   \
//   node scripts/enrich-catalog.mjs

import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DSQL_ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const DSQL_REGION = process.env.TOLLROAD_DSQL_REGION ?? "us-east-1";
const TABLE = process.env.TOLLROAD_TABLE;

const BEDROCK_MODEL_ID = "amazon.titan-embed-text-v2:0";

if (!DSQL_ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from CDK DsqlEndpoint output)");
  process.exit(1);
}
if (!TABLE) {
  console.error("Set TOLLROAD_TABLE (DynamoDB single-table name)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bedrock embed — constructed ONCE outside the loop (mirrors embeddings.ts)
// ---------------------------------------------------------------------------

const bedrockClient = new BedrockRuntimeClient({ region: DSQL_REGION });

async function embed(text) {
  const body = JSON.stringify({
    inputText: text,
    dimensions: 1024,
    normalize: true,
  });

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    body,
    contentType: "application/json",
    accept: "application/json",
  });

  const response = await bedrockClient.send(command);
  const responseBody = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(responseBody);

  if (!Array.isArray(parsed.embedding)) {
    throw new Error("Bedrock response missing embedding array");
  }
  return parsed.embedding;
}

// ---------------------------------------------------------------------------
// Descriptor builder — mirrors the brief's example + all readily available
// catalog fields from the TRACKS_SQL join in catalog.ts.
// ---------------------------------------------------------------------------

function buildDescriptor(row) {
  const genre = row.genre ? ` Genre: ${row.genre}.` : "";
  return `${row.title} by ${row.artist_name}.${genre}`;
}

// ---------------------------------------------------------------------------
// DynamoDB doc-client — constructed ONCE, uses default credential chain
// ---------------------------------------------------------------------------

const dynamoClient = new DynamoDBClient({ region: DSQL_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- 1. Connect to DSQL source (IAM token auth — mirrors migrate-dsql.mjs) ---
  const signer = new DsqlSigner({ hostname: DSQL_ENDPOINT, region: DSQL_REGION });
  const token = await signer.getDbConnectAdminAuthToken();

  const dsqlClient = new Client({
    host: DSQL_ENDPOINT,
    port: 5432,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: true },
  });

  await dsqlClient.connect();
  console.log("Connected to DSQL source.");

  // Exact join/columns from backend/src/domain/catalog.ts TRACKS_SQL
  const { rows: tracks } = await dsqlClient.query(`
    SELECT t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
           t.duration_seconds, t.price_per_minute_millicents, t.cover_image_key
    FROM tracks t
    JOIN artists a ON a.id = t.artist_id
    ORDER BY a.name, t.title
  `);

  await dsqlClient.end();
  console.log(`Fetched ${tracks.length} tracks from DSQL.`);

  if (tracks.length === 0) {
    console.log("No tracks to embed. Done.");
    return;
  }

  // --- 2. Embed each track and write to DynamoDB (TVEC partition) ---
  // Item shape matches backend/src/domain/vector-store.ts:
  //   PK = "TVEC", SK = trackId, embedding = number[], updatedAt = ISO string
  // DocumentClient marshals the number[] to DynamoDB List of Number automatically.

  let done = 0;
  for (const track of tracks) {
    const descriptor = buildDescriptor(track);
    const embedding = await embed(descriptor);

    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: "TVEC",
          SK: track.id,
          embedding,
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    done++;
    if (done % 10 === 0 || done === tracks.length) {
      console.log(`embedded ${done}/${tracks.length} → DynamoDB`);
    }
  }

  console.log(`Done. Wrote ${done} track vectors to DynamoDB table "${TABLE}".`);
}

main().catch((err) => {
  console.error("enrich-catalog failed:", err);
  process.exit(1);
});
