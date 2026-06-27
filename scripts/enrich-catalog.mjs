// Catalog embedding backfill — reads every track from Aurora DSQL,
// builds a text descriptor, embeds it with Amazon Bedrock Titan v2,
// and upserts the vector into the pgvector cluster.
//
// Idempotent: ON CONFLICT (track_id) DO UPDATE — safe to re-run.
//
// Usage:
//   TOLLROAD_DSQL_ENDPOINT=<endpoint>            \
//   TOLLROAD_VECTOR_HOST=<rds-endpoint>          \
//   TOLLROAD_VECTOR_MASTER_PASSWORD=<password>   \
//   [TOLLROAD_DSQL_REGION=us-east-1]             \
//   [TOLLROAD_VECTOR_REGION=us-east-1]           \
//   [TOLLROAD_VECTOR_PORT=5432]                  \
//   [TOLLROAD_VECTOR_DB=tollroad]                \
//   [TOLLROAD_VECTOR_ADMIN_USER=postgres]        \
//   node scripts/enrich-catalog.mjs

import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DSQL_ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const DSQL_REGION = process.env.TOLLROAD_DSQL_REGION ?? "us-east-1";

const VECTOR_HOST = process.env.TOLLROAD_VECTOR_HOST;
const VECTOR_PORT = Number(process.env.TOLLROAD_VECTOR_PORT ?? "5432");
const VECTOR_DB = process.env.TOLLROAD_VECTOR_DB ?? "tollroad";
const VECTOR_ADMIN_USER = process.env.TOLLROAD_VECTOR_ADMIN_USER ?? "postgres";
const VECTOR_MASTER_PASSWORD = process.env.TOLLROAD_VECTOR_MASTER_PASSWORD;
const VECTOR_REGION = process.env.TOLLROAD_VECTOR_REGION ?? "us-east-1";

const BEDROCK_MODEL_ID = "amazon.titan-embed-text-v2:0";

if (!DSQL_ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from CDK DsqlEndpoint output)");
  process.exit(1);
}
if (!VECTOR_HOST) {
  console.error("Set TOLLROAD_VECTOR_HOST (RDS pgvector endpoint)");
  process.exit(1);
}
if (!VECTOR_MASTER_PASSWORD) {
  console.error("Set TOLLROAD_VECTOR_MASTER_PASSWORD (Aurora master user password)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bedrock embed — constructed ONCE outside the loop (mirrors embeddings.ts)
// ---------------------------------------------------------------------------

const bedrockClient = new BedrockRuntimeClient({ region: VECTOR_REGION });

async function embed(text) {
  const body = JSON.stringify({
    inputText: text,
    dimensions: 1024,
    normalize: true,
  });

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    body,
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
// pgvector literal: [v1,v2,...] (the format accepted by $2::vector)
// ---------------------------------------------------------------------------

function toVectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
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

  // --- 2. Connect to pgvector target (master password — mirrors migrate-vector.mjs) ---
  const vectorClient = new Client({
    host: VECTOR_HOST,
    port: VECTOR_PORT,
    user: VECTOR_ADMIN_USER,
    database: VECTOR_DB,
    password: VECTOR_MASTER_PASSWORD,
    // TODO: pin Amazon RDS global-bundle.pem CA for cert verification before production
    ssl: { rejectUnauthorized: false },
  });

  await vectorClient.connect();
  console.log("Connected to pgvector target.");

  // --- 3. Embed each track and upsert ---
  const UPSERT_SQL = `
    INSERT INTO track_vectors (track_id, embedding, updated_at)
    VALUES ($1, $2::vector, now())
    ON CONFLICT (track_id) DO UPDATE
      SET embedding   = EXCLUDED.embedding,
          updated_at  = now()
  `;

  let done = 0;
  for (const track of tracks) {
    const descriptor = buildDescriptor(track);
    const embedding = await embed(descriptor);
    const vectorLiteral = toVectorLiteral(embedding);

    await vectorClient.query(UPSERT_SQL, [track.id, vectorLiteral]);

    done++;
    if (done % 10 === 0 || done === tracks.length) {
      console.log(`embedded ${done}/${tracks.length} — last: "${descriptor}"`);
    }
  }

  await vectorClient.end();
  console.log(`Done. Upserted ${done} track vectors.`);
}

main().catch((err) => {
  console.error("enrich-catalog failed:", err);
  process.exit(1);
});
