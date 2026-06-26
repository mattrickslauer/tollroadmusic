// One-shot live migration: rename every billing money column to *_millicents and
// scale existing values × 1000. Idempotent — re-running is a no-op once the
// marker row exists for a table. fee_cents is intentionally left in cents
// (Stripe boundary).
//
// DSQL constraints respected:
//   - Only ONE DDL statement per (implicit) transaction — each ALTER runs alone.
//   - No mixing DDL and DML in the same transaction — the scale UPDATE and marker
//     INSERT run in their own DML-only BEGIN/COMMIT.
//
// Algorithm per column:
//   1. CREATE TABLE IF NOT EXISTS migration_markers (DDL, idempotent, run once).
//   2. If marker row `millicents:<table>` exists → column already migrated; skip.
//   3. Else:
//      a. If newCol absent AND oldCol present → ALTER TABLE … RENAME COLUMN
//         (standalone DDL, no surrounding transaction).
//      b. BEGIN; UPDATE … SET newCol = newCol * 1000;
//             INSERT INTO migration_markers(name) VALUES ('millicents:<table>');
//         COMMIT;  (DML only — safe to combine.)

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
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
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
  const markerName = `millicents:${table}`;

  // Step 2: check if this table has already been fully migrated.
  const markerRow = await db.query(
    `SELECT 1 FROM migration_markers WHERE name = $1`,
    [markerName],
  );
  if (markerRow.rowCount > 0) {
    console.log(`skip ${table} (marker exists)`);
    continue;
  }

  // Step 3a: rename the column if needed (standalone DDL — no transaction wrapper).
  const newExists = await colExists(db, table, newCol);
  const oldExists = await colExists(db, table, oldCol);

  if (!newExists && oldExists) {
    await db.query(
      `ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`,
    );
    console.log(`renamed ${table}.${oldCol} -> ${newCol}`);
  } else if (newExists) {
    console.log(`${table}.${newCol} already present — skipping rename`);
  } else {
    console.warn(`WARNING: neither ${oldCol} nor ${newCol} found in ${table} — skipping scale`);
    continue;
  }

  // Step 3b: scale values and record marker in one DML transaction.
  await db.query("BEGIN");
  await db.query(`UPDATE ${table} SET ${newCol} = ${newCol} * 1000`);
  await db.query(
    `INSERT INTO migration_markers(name) VALUES ($1)`,
    [markerName],
  );
  await db.query("COMMIT");
  console.log(`migrated ${table}.${newCol} (×1000)`);
}

await db.end();
console.log("millicents migration complete");
