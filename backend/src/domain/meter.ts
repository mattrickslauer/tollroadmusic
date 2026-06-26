// Mirror a metered minute into the DynamoDB metering hot path (table `tollroad`).
// A METER item per (user, minute, track) is what the NEW_AND_OLD_IMAGES stream
// hands to the rollup Lambda (infra/lambda/rollup), which idempotently writes the
// Aurora DSQL royalty ledger + per-artist/day summary.
//
// This MIRRORS the synchronous DSQL ledger write in domain/billing.ts: both key on
// the same idempotency key (`<user>#<track>#<minute>`), so the rollup's
// `ON CONFLICT DO NOTHING` reconciles to a no-op — at-least-once Streams can never
// double-count. DSQL stays the system of record, so this emit is BEST-EFFORT: when
// the table isn't configured (local dev) we skip, and any write error is logged,
// never thrown into the charge path (the listener has already been billed durably).
import { currentMinuteEpoch } from "./billing.ts";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.TOLLROAD_TABLE;

// Metered events exist only to trigger the rollup (and short-term reverse lookups);
// the durable record lives in DSQL, so they carry a generous TTL and then expire.
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function meterEventsConfigured(): boolean {
  return Boolean(TABLE);
}

// Lazily import the SDK and reuse one client across warm invocations (same posture
// as lib/dsql.ts). The Node 20 Lambda runtime ships @aws-sdk/*, so it isn't bundled.
let sdk: Promise<typeof import("@aws-sdk/client-dynamodb")> | null = null;
let client: import("@aws-sdk/client-dynamodb").DynamoDBClient | null = null;
async function getClient() {
  if (!sdk) sdk = import("@aws-sdk/client-dynamodb");
  const m = await sdk;
  if (!client) client = new m.DynamoDBClient({ region: REGION });
  return { client, PutItemCommand: m.PutItemCommand };
}

export interface MeterEvent {
  accountId: string;
  trackId: string;
  artistId: string;
  /** Charge amount in millicents for this metered minute. */
  amountMillicents: number;
  /** Wall-clock minute the charge billed; pass the SAME value used for the DSQL
   *  ledger so the idempotency keys line up and the rollup reconciles to a no-op. */
  minuteEpoch?: number;
}

export async function emitMeterEvent(e: MeterEvent): Promise<void> {
  if (!TABLE) return; // unconfigured (local dev): the DSQL ledger write already ran.

  const minuteEpoch = e.minuteEpoch ?? currentMinuteEpoch();
  const key = `${e.accountId}#${e.trackId}#${minuteEpoch}`;
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  try {
    const { client, PutItemCommand } = await getClient();
    await client.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: {
          PK: { S: `USER#${e.accountId}` },
          SK: { S: `EVT#${minuteEpoch}#${e.trackId}` },
          type: { S: "METER" }, // the stream filter the rollup subscribes to
          idempotencyKey: { S: key },
          userId: { S: e.accountId },
          trackId: { S: e.trackId },
          artistId: { S: e.artistId },
          minuteEpoch: { N: String(minuteEpoch) },
          amountMillicents: { N: String(e.amountMillicents) },
          // GSI1 — reverse lookup ARTIST#<id> → recent metered events.
          GSI1PK: { S: `ARTIST#${e.artistId}` },
          GSI1SK: { S: `EVT#${minuteEpoch}#${e.accountId}` },
          ttl: { N: String(ttl) },
        },
        // One stream INSERT per unique metered minute: a duplicate charge for the
        // same minute must not re-fire the rollup.
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err) {
    // ConditionalCheckFailed = this minute was already metered — idempotent, fine.
    if ((err as { name?: string })?.name === "ConditionalCheckFailedException") return;
    // Anything else: the charge is already durable in DSQL, so log and move on.
    console.error(`[meter] failed to emit METER event for ${key}:`, err);
  }
}
