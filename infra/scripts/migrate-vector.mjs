// Apply the TollRoad vector schema. Run once after the cluster is up:
//   TOLLROAD_VECTOR_HOST=<endpoint> node scripts/migrate-vector.mjs
//
// Auth is an IAM token used as the password (standard `pg` works, RDS Signer).
// The DDL adds pgvector support + track embeddings table + HNSW index +
// vector_app role with IAM auth and ALL privileges on the table.

import { Client } from "pg";
import { Signer } from "@aws-sdk/rds-signer";

const HOST = process.env.TOLLROAD_VECTOR_HOST;
const PORT = Number(process.env.TOLLROAD_VECTOR_PORT ?? "5432");
const DB = process.env.TOLLROAD_VECTOR_DB ?? "tollroad";
const ADMIN_USER = process.env.TOLLROAD_VECTOR_ADMIN_USER ?? "postgres";
const REGION = process.env.TOLLROAD_VECTOR_REGION ?? "us-east-1";

if (!HOST) {
  console.error("Set TOLLROAD_VECTOR_HOST (RDS endpoint)");
  process.exit(1);
}

// Additive DDL for the vector cluster: pgvector extension, track_vectors table,
// HNSW index, and the vector_app role with IAM auth + privileges.
const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS track_vectors (
     track_id uuid PRIMARY KEY,
     embedding vector(1024) NOT NULL,
     bpm int, energy real, explicit boolean DEFAULT false,
     mood text, updated_at timestamptz DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS track_vectors_embedding_hnsw
     ON track_vectors USING hnsw (embedding vector_cosine_ops)`,
  // app role for IAM auth:
  `DO $$ BEGIN CREATE ROLE vector_app WITH LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `GRANT rds_iam TO vector_app`,
  `GRANT ALL ON track_vectors TO vector_app`,
];

const signer = new Signer({
  hostname: HOST,
  port: PORT,
  username: ADMIN_USER,
  region: REGION,
});

const token = await signer.getAuthToken();
const client = new Client({
  host: HOST,
  port: PORT,
  user: ADMIN_USER,
  database: DB,
  password: token,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
for (const sql of STATEMENTS) {
  const label = sql.split("\n")[0].slice(0, 60);
  await client.query(sql);
  console.log("ok:", label);
}

await client.end();
console.log("Vector schema applied.");
