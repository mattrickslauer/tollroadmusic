"use strict";

/**
 * TollRoad royalty rollup — DynamoDB Streams consumer.
 *
 * Consumes metered-minute events (type=METER) and writes the APPEND-ONLY royalty
 * ledger in Aurora DSQL, then bumps the per-artist/day summary. DynamoDB Streams
 * are at-least-once (duplicates happen) and Lambda retries on error, so every
 * write is idempotent:
 *
 *   - ledger insert keyed by idempotency_key = '<user>#<track>#<minuteEpoch>'
 *     with ON CONFLICT DO NOTHING — a replay is a no-op.
 *   - the summary is incremented ONLY when the ledger row was newly inserted,
 *     so duplicates never inflate earnings.
 *
 * DSQL specifics this respects:
 *   - OCC (no row locks): on serialization failure (SQLSTATE 40001) we retry the
 *     whole transaction with backoff.
 *   - per-txn caps (3,000 rows / 10 MiB / 5 min): we process one event per
 *     transaction (batchSize tuning lives in the CDK event source).
 *   - IAM-token auth: token generated per cold start, client reused warm.
 */

const { Client } = require("pg");
const { DsqlSigner } = require("@aws-sdk/dsql-signer");

const ENDPOINT = process.env.DSQL_ENDPOINT;
const REGION = process.env.DSQL_REGION || "us-east-1";

let client; // reused across warm invocations

async function getClient() {
  if (client) return client;
  const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
  const token = await signer.getDbConnectAdminAuthToken();
  client = new Client({
    host: ENDPOINT,
    port: 5432,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

const LEDGER_SQL = `
  INSERT INTO royalty_ledger
    (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_cents)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key`;

const SUMMARY_SQL = `
  INSERT INTO artist_daily_summary (artist_id, day, minutes, amount_cents)
  VALUES ($1, to_timestamp($2 * 60)::date, 1, $3)
  ON CONFLICT (artist_id, day)
  DO UPDATE SET minutes = artist_daily_summary.minutes + 1,
                amount_cents = artist_daily_summary.amount_cents + EXCLUDED.amount_cents`;

async function creditOnce(db, e) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.query("BEGIN");
      const r = await db.query(LEDGER_SQL, [
        e.idempotencyKey,
        e.userId,
        e.trackId,
        e.artistId,
        e.minuteEpoch,
        e.amountCents,
      ]);
      // Only bump the summary if this minute was genuinely new (not a replay).
      if (r.rowCount === 1) {
        await db.query(SUMMARY_SQL, [e.artistId, e.minuteEpoch, e.amountCents]);
      }
      await db.query("COMMIT");
      return;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      // 40001 = OCC serialization failure → retry with backoff.
      if (err && err.code === "40001" && attempt < 4) {
        await new Promise((res) => setTimeout(res, 25 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

function parseEvent(record) {
  const img = record.dynamodb && record.dynamodb.NewImage;
  if (!img) return null;
  const s = (k) => (img[k] && img[k].S) || undefined;
  const n = (k) => (img[k] && img[k].N != null ? Number(img[k].N) : undefined);
  const e = {
    idempotencyKey: s("idempotencyKey"),
    userId: s("userId"),
    trackId: s("trackId"),
    artistId: s("artistId"),
    minuteEpoch: n("minuteEpoch"),
    amountCents: n("amountCents"),
  };
  if (!e.idempotencyKey || !e.artistId || e.minuteEpoch == null) return null;
  return e;
}

exports.handler = async (event) => {
  const db = await getClient();
  const events = (event.Records || [])
    .filter((r) => r.eventName === "INSERT")
    .map(parseEvent)
    .filter(Boolean);

  for (const e of events) {
    await creditOnce(db, e);
  }
  return { credited: events.length };
};
