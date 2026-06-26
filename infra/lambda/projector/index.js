"use strict";

/**
 * TollRoad CQRS projector — DynamoDB Streams → Aurora DSQL.
 *
 * Under polyglot CQRS the command side writes ONLY to DynamoDB (the `tollroad`
 * table): the conditional balance debit and the metered-minute / top-up events.
 * This Lambda is the SOLE writer of the DSQL read models — the append-only
 * `royalty_ledger`, the per-artist/day `artist_daily_summary`, the `wallet_topups`
 * record, and the eventually-consistent reconciliation balance in
 * `listener_profiles.balance_cents`. Because the command path no longer races a
 * synchronous DSQL ledger write, the projector's INSERT is now the real, winning
 * write — the old rollup bug (summary never updating because the ledger row
 * already existed) disappears by construction.
 *
 * The stream is at-least-once (duplicates happen) and Lambda retries on error, so
 * every projection is idempotent:
 *
 *   - METER → INSERT royalty_ledger ON CONFLICT (idempotency_key) DO NOTHING; the
 *     summary upsert AND the reconciliation debit fire ONLY when the ledger row
 *     was genuinely new, so duplicates never inflate earnings or double-debit.
 *   - TOPUP → INSERT wallet_topups ON CONFLICT (payment_ref) DO NOTHING; the
 *     reconciliation credit fires ONLY when the top-up row was new.
 *
 * DSQL specifics this respects:
 *   - OCC (no row locks): on serialization failure (SQLSTATE 40001) we retry the
 *     whole transaction with backoff.
 *   - per-txn caps (3,000 rows / 10 MiB / 5 min): one event per transaction.
 *   - IAM-token auth: least-privilege DML role (not admin) — the CDK grants this
 *     Lambda dsql:DbConnect; token generated per cold start, client reused warm.
 */

const { Client } = require("pg");
const { DsqlSigner } = require("@aws-sdk/dsql-signer");

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
// Least-privilege: the projector connects as a DML-only role, NOT admin. The CDK
// grants dsql:DbConnect (not DbConnectAdmin); the role is provisioned by the
// additive migration (scripts/migrate-dsql.mjs, gated on TOLLROAD_PROJECTOR_ROLE_ARN).
const DB_USER = process.env.TOLLROAD_DSQL_USER || "projector";

let client; // reused across warm invocations

async function getClient() {
  if (client) return client;
  const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
  const token =
    DB_USER === "admin"
      ? await signer.getDbConnectAdminAuthToken()
      : await signer.getDbConnectAuthToken();
  client = new Client({
    host: ENDPOINT,
    port: 5432,
    user: DB_USER,
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

const TOPUP_SQL = `
  INSERT INTO wallet_topups
    (payment_ref, account_id, amount_cents, fee_cents, method, status)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (payment_ref) DO NOTHING
  RETURNING payment_ref`;

// Reconciliation balance: the eventually-consistent projection of the authoritative
// DynamoDB balance. A METER debits it (negative delta), a TOPUP credits it. Upsert
// so a not-yet-projected profile still reconciles.
const RECONCILE_BALANCE_SQL = `
  INSERT INTO listener_profiles (account_id, balance_cents)
  VALUES ($1, $2)
  ON CONFLICT (account_id)
  DO UPDATE SET balance_cents = listener_profiles.balance_cents + EXCLUDED.balance_cents`;

// Optional stream-progress observability (additive). Best-effort; never fails a batch.
const CHECKPOINT_SQL = `
  INSERT INTO projector_checkpoint (shard_id, last_seq, updated_at)
  VALUES ($1, $2, now())
  ON CONFLICT (shard_id)
  DO UPDATE SET last_seq = EXCLUDED.last_seq, updated_at = now()`;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function projectMeter(db, e) {
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
      // Only when this minute was genuinely new (not a replay): bump the summary
      // and reconcile the balance down by the amount the command path already debited.
      if (r.rowCount === 1) {
        await db.query(SUMMARY_SQL, [e.artistId, e.minuteEpoch, e.amountCents]);
        await db.query(RECONCILE_BALANCE_SQL, [e.userId, -e.amountCents]);
      }
      await db.query("COMMIT");
      return;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      // 40001 = OCC serialization failure → retry with backoff.
      if (err && err.code === "40001" && attempt < 4) {
        await sleep(25 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

async function projectTopup(db, e) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.query("BEGIN");
      const r = await db.query(TOPUP_SQL, [
        e.paymentRef,
        e.accountId,
        e.amountCents,
        e.feeCents,
        e.method,
        e.status,
      ]);
      // Credit the reconciliation balance only when the top-up row was new.
      if (r.rowCount === 1) {
        await db.query(RECONCILE_BALANCE_SQL, [e.accountId, e.amountCents]);
      }
      await db.query("COMMIT");
      return;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      if (err && err.code === "40001" && attempt < 4) {
        await sleep(25 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

const imgStr = (img, k) => (img[k] && img[k].S) || undefined;
const imgNum = (img, k) => (img[k] && img[k].N != null ? Number(img[k].N) : undefined);

function parseMeter(img) {
  const e = {
    idempotencyKey: imgStr(img, "idempotencyKey"),
    userId: imgStr(img, "userId"),
    trackId: imgStr(img, "trackId"),
    artistId: imgStr(img, "artistId"),
    minuteEpoch: imgNum(img, "minuteEpoch"),
    amountCents: imgNum(img, "amountCents"),
  };
  if (!e.idempotencyKey || !e.artistId || e.minuteEpoch == null) return null;
  return e;
}

function parseTopup(img) {
  const e = {
    paymentRef: imgStr(img, "paymentRef"),
    // The command store (domain/wallet-store.ts) writes the account id under
    // `userId` on BOTH meter and topup items; keep one name on the wire.
    accountId: imgStr(img, "userId"),
    amountCents: imgNum(img, "amountCents"),
    feeCents: imgNum(img, "feeCents") ?? 0,
    method: imgStr(img, "method") || "demo",
    status: imgStr(img, "status") || "succeeded",
  };
  if (!e.paymentRef || !e.accountId || e.amountCents == null) return null;
  return e;
}

async function writeCheckpoint(db, records) {
  if (!records.length) return;
  const last = records[records.length - 1];
  const seq = last.dynamodb && last.dynamodb.SequenceNumber;
  if (!seq) return;
  // No shard id is exposed on the record; key by the stream ARN (stable per stream).
  const shard = (last.eventSourceARN || "tollroad").slice(-128);
  await db.query(CHECKPOINT_SQL, [shard, seq]);
}

exports.handler = async (event) => {
  const db = await getClient();
  const records = (event.Records || []).filter((r) => r.eventName === "INSERT");

  let projected = 0;
  for (const r of records) {
    const img = r.dynamodb && r.dynamodb.NewImage;
    if (!img) continue;
    const type = img.type && img.type.S;
    if (type === "METER") {
      const e = parseMeter(img);
      if (e) {
        await projectMeter(db, e);
        projected++;
      }
    } else if (type === "TOPUP") {
      const e = parseTopup(img);
      if (e) {
        await projectTopup(db, e);
        projected++;
      }
    }
  }

  // Observability only — a failed checkpoint must not re-drive the batch.
  await writeCheckpoint(db, records).catch((err) =>
    console.error("[projector] checkpoint write failed:", err),
  );
  return { projected };
};
