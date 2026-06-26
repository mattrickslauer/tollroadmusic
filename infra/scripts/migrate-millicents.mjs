// One-shot live migration: scale existing cent values × 1000, then rename every
// billing money column to *_millicents. Idempotent — re-running is a no-op once
// the DB is fully migrated. fee_cents is intentionally left in cents (Stripe
// boundary).
//
// DSQL constraints respected:
//   - Only ONE DDL statement per (implicit) transaction — each ALTER runs alone.
//   - No mixing DDL and DML in the same transaction — the scale UPDATE and marker
//     INSERT run in their own DML-only BEGIN/COMMIT.
//
// Algorithm per column (scale-then-rename with per-table marker):
//   1. CREATE TABLE IF NOT EXISTS migration_markers (DDL, idempotent, run once).
//   2. Determine oldExists and newExists via information_schema.
//   3. If oldExists is TRUE (column still in cents — the only case that should scale):
//      a. If marker `scaled:<table>` is ABSENT: run, in one DML-only transaction,
//         BEGIN; UPDATE <table> SET <oldCol> = <oldCol> * 1000;
//               INSERT INTO migration_markers(name) VALUES ('scaled:<table>');
//         COMMIT;  (scale while column is still named <oldCol>)
//      b. Then run ALTER TABLE <table> RENAME COLUMN <oldCol> TO <newCol>
//         as a standalone DDL (regardless of whether the marker was already set,
//         i.e. crash-safe: if we scaled but didn't rename, we still rename).
//   4. If oldExists is FALSE (column is already <newCol>):
//      → Do NOTHING. Covers born-millicents DBs and fully-migrated DBs.
//        Logs "skip <table> (already millicents)".
//
// Crash-safety: a crash after scale but before rename leaves <oldCol> present +
// marker set → re-run skips the scale (marker present) and just renames.
// No double-scale, no ambiguity.

import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
if (!ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from the CDK DsqlEndpoint output)");
  process.exit(1);
}

const COLS = [
  ["listener_profiles",    "balance_cents",          "balance_millicents"],
  ["royalty_ledger",       "amount_cents",            "amount_millicents"],
  ["wallet_topups",        "amount_cents",            "amount_millicents"],
  ["artist_daily_summary", "amount_cents",            "amount_millicents"],
  ["tracks",               "price_per_minute_cents",  "price_per_minute_millicents"],
];

async function colExists(db, table, col) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, col],
  );
  return r.rowCount > 0;
}

const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
const token = await signer.getDbConnectAdminAuthToken();
const db = new Client({
  host: ENDPOINT,
  port: 5432,
  user: "admin",
  database: "postgres",
  password: token,
  ssl: { rejectUnauthorized: true },
});

await db.connect();

// Step 1: ensure the marker table exists (single DDL, idempotent).
await db.query(
  `CREATE TABLE IF NOT EXISTS migration_markers (name TEXT PRIMARY KEY)`,
);

for (const [table, oldCol, newCol] of COLS) {
  const oldExists = await colExists(db, table, oldCol);
  const newExists = await colExists(db, table, newCol);

  if (!oldExists) {
    // Column is already newCol (born-millicents DB or fully migrated) — skip.
    if (newExists) {
      console.log(`skip ${table} (already millicents)`);
    } else {
      console.warn(`WARNING: neither ${oldCol} nor ${newCol} found in ${table} — skipping`);
    }
    continue;
  }

  // oldCol exists (still in cents) — scale then rename.

  // Step 3a: scale values in a DML-only transaction (skip if marker already set,
  // i.e. a previous run scaled but crashed before the rename).
  const markerName = `scaled:${table}`;
  const markerRow = await db.query(
    `SELECT 1 FROM migration_markers WHERE name = $1`,
    [markerName],
  );
  if (markerRow.rowCount === 0) {
    await db.query("BEGIN");
    await db.query(`UPDATE ${table} SET ${oldCol} = ${oldCol} * 1000`);
    await db.query(
      `INSERT INTO migration_markers(name) VALUES ($1)`,
      [markerName],
    );
    await db.query("COMMIT");
    console.log(`scaled ${table}.${oldCol} (×1000)`);
  } else {
    console.log(`skip scale ${table} (already scaled — completing rename)`);
  }

  // Step 3b: rename the column (standalone DDL — no transaction wrapper).
  await db.query(
    `ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`,
  );
  console.log(`renamed ${table}.${oldCol} -> ${newCol}`);
}

await db.end();
console.log("millicents migration complete");
