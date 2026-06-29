// Vibe Pad (mood-pad-game) DSQL migration — ADDITIVE ONLY.
//
// Creates the three new mood tables. Safe to run against the shared DSQL cluster:
// every statement is `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX ASYNC IF NOT
// EXISTS`, so it never alters, seeds, or drops an existing table. Mirrors the
// auth/connection posture of infra/scripts/migrate-dsql.mjs (IAM token as the pg
// password; one DDL statement per transaction — DSQL won't mix DDL with DML).
//
//   TOLLROAD_DSQL_ENDPOINT=<endpoint> node scripts/migrate-mood.mjs
//
// ARRAY STORAGE: Aurora DSQL does NOT support array COLUMN types — `real[]`,
// `int[]`, `text[]`, etc. all fail with `0A000 datatype <t>[] not supported`
// (an array literal is fine as a value/param, just not as a column). So the
// grid-aligned v/e samples are stored as `jsonb` arrays. `jsonb_array_elements
// (col) WITH ORDINALITY` reproduces the spec's `generate_subscripts`+`t.v[idx]`
// access pattern (verified live).
//
// GAP SENTINEL: gaps (puck released) are stored as JSON `null` elements inside
// the jsonb arrays (jsonb roundtrips them cleanly). The consensus/agreement SQL
// converts each element with `NULLIF(elem,'null'::jsonb)::text::real`, so a gap
// becomes SQL NULL and is dropped by `avg(...) FILTER (WHERE ... IS NOT NULL)`.
import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
if (!ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from the CDK DsqlEndpoint output)");
  process.exit(1);
}

const STATEMENTS = [
  // One durable mood trace per (user, song). `v`/`e` are grid-aligned real[]
  // arrays — index = 250ms time bin; a released-puck gap is a SQL NULL element.
  // trace_id is the PK; UNIQUE(user_id, song_id) makes a re-reaction an UPSERT.
  `CREATE TABLE IF NOT EXISTS mood_traces (
     trace_id          TEXT PRIMARY KEY,
     user_id           TEXT NOT NULL,
     song_id           TEXT NOT NULL,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     duration_ms       INTEGER,
     grid_ms           INTEGER,
     sample_count      INTEGER,
     coverage_pct      REAL,
     agreement         REAL,
     reward_millicents BIGINT,
     v                 JSONB,
     e                 JSONB,
     UNIQUE (user_id, song_id)
   )`,
  // Per-user lookups: re-reaction UPSERT + daily-rewarded-cap count.
  `CREATE INDEX ASYNC IF NOT EXISTS mood_traces_by_user ON mood_traces (user_id, created_at)`,
  // Binned crowd curve (the consensus rollup) — one row per song. Source for the
  // live ghost and for AI tagging. v/e aligned to the same 250ms grid, NULL where
  // no trace had signal in a bin.
  `CREATE TABLE IF NOT EXISTS song_consensus (
     song_id      TEXT PRIMARY KEY,
     grid_ms      INTEGER,
     v            JSONB,
     e            JSONB,
     trace_count  INTEGER,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Rule-based mood tags derived from the consensus (Phase C1). source='human'
  // for crowd-derived tags; 'predicted' reserved for the cold-song model.
  `CREATE TABLE IF NOT EXISTS song_mood_tags (
     song_id           TEXT PRIMARY KEY,
     dominant_quadrant TEXT,
     arc_label         TEXT,
     valence_mean      REAL,
     energy_mean       REAL,
     confidence        REAL,
     source            TEXT,
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
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
console.log("Mood DSQL schema applied.");
