// Apply the TollRoad DSQL schema. Run once after the cluster is up:
//   TOLLROAD_DSQL_ENDPOINT=<endpoint> node scripts/migrate-dsql.mjs
//
// Auth is an IAM token used as the password (standard `pg` works). The DDL is
// the canonical copy of docs/data-model.md. DSQL caveats baked in: no FKs (app
// enforces), no triggers, secondary indexes via CREATE INDEX ASYNC, append-only
// ledger keyed by a UNIQUE idempotency key, precomputed summary table for BI.

import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
if (!ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from the CDK DsqlEndpoint output)");
  process.exit(1);
}

// One statement per array entry — DSQL allows a single DDL statement per
// transaction and won't mix DDL with DML.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS artists (
     id          UUID PRIMARY KEY,
     name        TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Artist sign-up captures more than the catalog needs — one ADD COLUMN per
  // statement (DSQL allows a single DDL op per transaction). Most are nullable
  // so the form stays SuperEasy: only name + email are required (app layer).
  //
  // Payouts run on Stripe Connect (Express): we store the connected-account id
  // (acct_…) and whether Stripe has enabled payouts. Bank/identity details live
  // in Stripe, never here.
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS email             TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS genre             TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio               TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS location          TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS website           TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`,
  // DSQL rejects ALTER ADD COLUMN with a constraint/default, so payouts_enabled
  // is nullable here. The app always inserts an explicit false and the webhook
  // sets true/false, so NULL never occurs in practice; treat NULL as false.
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS payouts_enabled   BOOLEAN`,
  `CREATE INDEX ASYNC IF NOT EXISTS artists_by_email ON artists (email)`,
  `CREATE INDEX ASYNC IF NOT EXISTS artists_by_stripe ON artists (stripe_account_id)`,
  `CREATE TABLE IF NOT EXISTS tracks (
     id                     UUID PRIMARY KEY,
     artist_id              UUID NOT NULL,
     title                  TEXT NOT NULL,
     duration_seconds       INTEGER NOT NULL,
     price_per_minute_cents INTEGER NOT NULL DEFAULT 1,
     audio_key              TEXT NOT NULL,
     created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS tracks_by_artist ON tracks (artist_id)`,
  `CREATE TABLE IF NOT EXISTS accounts (
     user_id     UUID PRIMARY KEY,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Append-only royalty ledger — one immutable credit row per metered minute.
  `CREATE TABLE IF NOT EXISTS royalty_ledger (
     idempotency_key TEXT PRIMARY KEY,
     user_id         UUID NOT NULL,
     track_id        UUID NOT NULL,
     artist_id       UUID NOT NULL,
     minute_epoch    BIGINT NOT NULL,
     amount_cents    INTEGER NOT NULL,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS ledger_by_artist_minute ON royalty_ledger (artist_id, minute_epoch)`,
  // Precomputed BI — dashboard reads this, never scans the ledger.
  `CREATE TABLE IF NOT EXISTS artist_daily_summary (
     artist_id     UUID NOT NULL,
     day           DATE NOT NULL,
     minutes       BIGINT NOT NULL DEFAULT 0,
     amount_cents  BIGINT NOT NULL DEFAULT 0,
     PRIMARY KEY (artist_id, day)
   )`,
];

const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
const token = await signer.getDbConnectAdminAuthToken();
const client = new Client({
  host: ENDPOINT,
  port: 5432,
  user: "admin",
  database: "postgres",
  password: token,
  ssl: { rejectUnauthorized: true },
});

await client.connect();
for (const sql of STATEMENTS) {
  const label = sql.split("\n")[0].slice(0, 60);
  await client.query(sql);
  console.log("ok:", label);
}
await client.end();
console.log("DSQL schema applied.");
