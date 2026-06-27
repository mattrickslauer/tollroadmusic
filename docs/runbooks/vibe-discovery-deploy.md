# Vibe Discovery + MCP — Deploy & Demo Runbook

**Date:** 2026-06-27  
**Branch:** `agentic-vibe-dj`  
**Who:** any operator with AWS creds + a `backend/.env` restore file

This runbook deploys the vibe-discovery feature from zero (or redeploys it safely) and
ends with a live demo of the MCP server. Execute the steps in order.

---

## Prerequisites

- AWS credentials active in your shell (`aws sts get-caller-identity` passes).
- `backend/.env` is populated with all required secrets (the restore source — see the
  Lambda secret drift incident in memory). At minimum:
  `TOLLROAD_SESSION_SECRET`, `TOLLROAD_CF_PRIVATE_KEY`, `TOLLROAD_SMTP_PASS`,
  `TOLLROAD_CF_KEY_PAIR_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Node.js 20+ in PATH (the scripts use `--experimental-strip-types`).
- Bedrock model access enabled in `us-east-1` for `amazon.titan-embed-text-v2:0`
  (one-time: AWS Console → Bedrock → Model access → enable Titan Embed Text V2).

---

## Step 1 — Deploy infra (safe-secret recipe)

> **NEVER run a bare `cdk deploy`.** A bare deploy silently drops every secret from
> the Lambda environment, which wipes `TOLLROAD_SESSION_SECRET` and kills auth.
> This is the known prod-outage landmine (see memory: Lambda secret drift incident,
> safe-backend-deploy).

Use the guarded deploy script from the repo root. It reads `backend/.env`, validates
every required secret, and passes them all to CDK as `-c KEY=value`:

```bash
# From the repo root
node infra/scripts/deploy.mjs
```

To do a dry run first (validate the env file without deploying):

```bash
node infra/scripts/deploy.mjs --check
```

To pass extra CDK flags (e.g. approve without prompts):

```bash
node infra/scripts/deploy.mjs -- --require-approval never
```

This deploy provisions or updates:
- The existing DynamoDB table, Aurora DSQL cluster, S3/CloudFront audio pipeline.
- **NEW:** a minimal VPC, an Aurora PostgreSQL Serverless v2 cluster (`TollroadVector`)
  with scale-to-zero (`minCapacity: 0`, `secondsUntilAutoPause: 300`, `maxCapacity: 4`)
  for the pgvector read-store.
- The Lambda gets `TOLLROAD_VECTOR_HOST/PORT/DB/USER/REGION` injected automatically.
- The Lambda's IAM role gets `rds-db:connect` for the `vector_app` database user.
- The Aurora master-user credentials are stored in AWS Secrets Manager (auto-created
  by CDK, tagged with the CloudFormation stack name).

CDK outputs the `ApiBaseUrl` and key IDs on completion — note them.

---

## Step 2 — Retrieve the Aurora master password

The `DatabaseCluster` construct auto-creates a Secrets Manager secret for the
master user (`postgres`). Fetch it to use in Steps 3 and 4.

**Find the secret ARN** (it lives in the CloudFormation resources for the stack):

```bash
aws cloudformation describe-stack-resources \
  --stack-name TollroadStack \
  --query "StackResourceSummaries[?ResourceType=='AWS::SecretsManager::Secret'].PhysicalResourceId" \
  --output text
```

This prints one or more ARNs. The one for the vector cluster will contain
`TollroadVector` in its name (e.g. `TollroadStack-TollroadVectorSecret<hash>-<id>`).

**Retrieve the secret value:**

```bash
aws secretsmanager get-secret-value \
  --secret-id <ARN-from-above> \
  --query 'SecretString' --output text | python3 -m json.tool
```

The JSON will contain `{ "username": "postgres", "password": "...", "host": "...", ... }`.
Copy the `password` value — this is `TOLLROAD_VECTOR_MASTER_PASSWORD` for Steps 3 and 4.
The `host` value is the cluster endpoint (`TOLLROAD_VECTOR_HOST`).

Alternatively, list all secrets tagged with the stack and filter by name:

```bash
aws secretsmanager list-secrets \
  --filters Key=tag-key,Values=aws:cloudformation:stack-name \
  Key=tag-value,Values=TollroadStack \
  --query 'SecretList[*].{Name:Name,ARN:ARN}' --output table
```

---

## Step 3 — Run the vector schema migration

Applies the pgvector extension, `track_vectors` table, HNSW index, and the
`vector_app` IAM role. Idempotent — safe to re-run.

```bash
TOLLROAD_VECTOR_HOST=<cluster-endpoint-from-step-2> \
TOLLROAD_VECTOR_MASTER_PASSWORD=<password-from-step-2> \
node infra/scripts/migrate-vector.mjs
```

Expected output:
```
ok: CREATE EXTENSION IF NOT EXISTS vector
ok: CREATE TABLE IF NOT EXISTS track_vectors (
ok: CREATE INDEX IF NOT EXISTS track_vectors_embedding_hnsw
ok: DO $$ BEGIN CREATE ROLE vector_app WITH LOGIN; EXCEPTION WHEN dup...
ok: GRANT rds_iam TO vector_app
ok: GRANT ALL ON track_vectors TO vector_app
Vector schema applied.
```

**Optional env overrides** (all have defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `TOLLROAD_VECTOR_PORT` | `5432` | Cluster port |
| `TOLLROAD_VECTOR_DB` | `tollroad` | Database name |
| `TOLLROAD_VECTOR_ADMIN_USER` | `postgres` | Master user for DDL |
| `TOLLROAD_VECTOR_REGION` | `us-east-1` | AWS region |

Note: the migration uses the master-user password (not IAM auth) because the master
user cannot use `rds_iam`. The `vector_app` role it creates uses IAM auth for the
Lambda's runtime queries.

---

## Step 4 — Backfill catalog embeddings

Reads every track from Aurora DSQL, builds a text descriptor (`"<title> by <artist>.
Genre: <genre>."`), embeds it via Bedrock Titan v2 (`amazon.titan-embed-text-v2:0`,
1024 dimensions), and upserts the vector into `track_vectors`. Idempotent (`ON
CONFLICT DO UPDATE`) — safe to re-run or resume after a partial run.

```bash
TOLLROAD_DSQL_ENDPOINT=<dsql-endpoint> \
TOLLROAD_VECTOR_HOST=<cluster-endpoint-from-step-2> \
TOLLROAD_VECTOR_MASTER_PASSWORD=<password-from-step-2> \
node scripts/enrich-catalog.mjs
```

The `TOLLROAD_DSQL_ENDPOINT` is the CDK output `DsqlEndpoint` (e.g.
`<identifier>.dsql.us-east-1.on.aws`). Retrieve it:

```bash
aws cloudformation describe-stacks \
  --stack-name TollroadStack \
  --query "Stacks[0].Outputs[?OutputKey=='DsqlEndpoint'].OutputValue" \
  --output text
```

The script authenticates to DSQL using an IAM admin token (your shell's AWS creds)
and to the vector cluster using the master password. It logs progress every 10
tracks:

```
Connected to DSQL source.
Fetched 80 tracks from DSQL.
Connected to pgvector target.
embedded 10/80 — last: "Neon Drift by Axon Valley. Genre: Synthwave."
...
Done. Upserted 80 track vectors.
```

**All optional overrides for the vector target** are the same as in Step 3. The
DSQL region can be overridden with `TOLLROAD_DSQL_REGION` (default `us-east-1`).

**Bedrock access must be enabled** in the account before this step. If you see
`AccessDeniedException: ... amazon.titan-embed-text-v2:0`, go to
AWS Console → Bedrock → Model access → enable Titan Embed Text V2.

---

## Step 5 — Verify the discovery endpoint

```bash
API=https://<ApiBaseUrl-from-cdk-output>

curl -s -XPOST "$API/v1/discover" \
  -H "x-api-key: <app-api-key>" \
  -H "content-type: application/json" \
  -d '{"vibe":"tense boss fight, 140bpm synthwave"}' | python3 -m json.tool
```

To fetch the app API key value:

```bash
KEY_ID=$(aws cloudformation describe-stacks --stack-name TollroadStack \
  --query "Stacks[0].Outputs[?OutputKey=='AppApiKeyId'].OutputValue" --output text)
aws apigateway get-api-key --api-key "$KEY_ID" --include-value \
  --query 'value' --output text
```

Expected response shape:

```json
{
  "results": [
    {
      "trackId": "...",
      "title": "Neon Grid",
      "artistName": "Voltage",
      "genre": "Synthwave",
      "score": 0.94
    },
    ...
  ]
}
```

Optional filters accepted by `/v1/discover`:

| Field | Type | Example |
|---|---|---|
| `vibe` | string (required) | `"chill lo-fi study beats"` |
| `limit` | int 1–50 | `10` |
| `bpmMin` / `bpmMax` | int | `120` / `140` |
| `maxEnergy` | float 0–1 | `0.7` |
| `allowExplicit` | bool | `false` |

If the Aurora cluster was idle, the first request may time out or take 10–15 seconds
(see Step 7). Retry once if you get a 502/504.

---

## Step 6 — Run the MCP server

The MCP server (`mcp/`) exposes TollRoad's HTTP API as stdio tools for AI agent
clients (Claude Desktop, Claude Code, etc.).

**Start the server:**

```bash
cd mcp
npm install        # first time only
TOLLROAD_API_BASE=https://<ApiBaseUrl>/v1 \
TOLLROAD_API_KEY=<app-or-agent-api-key> \
node --experimental-strip-types src/server.ts
```

The server reads from stdin and writes to stdout (stdio transport). It stays alive
until stdin closes or the process is killed. Add `TOLLROAD_TOKEN=<jwt>` for
end-user session context (passes `Authorization: Bearer` on each tool call).

**Add to a MCP client (Claude Desktop / Claude Code):**

In `claude_desktop_config.json` (or your client's equivalent):

```json
{
  "mcpServers": {
    "tollroad-vibe-dj": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/absolute/path/to/tollroadmusic/mcp/src/server.ts"
      ],
      "env": {
        "TOLLROAD_API_BASE": "https://<ApiBaseUrl>/v1",
        "TOLLROAD_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

**Available tools:**

| Tool | Description |
|---|---|
| `search_music` | Discover tracks by vibe/mood with optional BPM/energy/explicit filters. Calls `POST /v1/discover`. |
| `start_session` | Start a DJ session queue. Calls `POST /v1/sessions`. Returns a `session` ID. |
| `next_track` | Advance the session to the next track (optional `signal` hint). Calls `POST /v1/sessions/{id}/next`. |
| `get_stream` | Get a signed CloudFront URL for a track. Calls `GET /v1/stream/{trackId}`. Returns 402 if the balance is zero. |
| `get_balance` | Check the current wallet balance. Calls `GET /v1/balance`. |

**Demo flow for a live session:**

```
search_music(vibe="tense boss fight, 140bpm synthwave", limit=5)
  → pick a track id from results

start_session(context="boss fight playlist")
  → returns { sessionId: "..." }

next_track(session="<sessionId>")
  → returns next track + metadata

get_stream(track_id="<trackId>")
  → returns { url: "https://...cloudfront.net/...", expiresAt: "..." }
  (browser or audio player can consume this URL directly)
```

See `mcp/README.md` for the full API reference and how to add tools.

---

## Step 7 — Cold-start note (read before a live demo)

The Aurora Serverless v2 cluster is configured with `minCapacity: 0` and
`secondsUntilAutoPause: 300`. After five minutes of inactivity it scales to zero ACU.

The first `/discover` (or any query) after a pause pays a **~10–15 second resume
latency** while Aurora spins back up. During resume the database connection hangs,
and API Gateway may return a 502 or 504 before the cluster is ready.

**Before a live demo:**

```bash
# Send a warm-ping 30 seconds before you need it on stage.
curl -s -XPOST "$API/v1/discover" \
  -H "x-api-key: <key>" \
  -H "content-type: application/json" \
  -d '{"vibe":"warm up ping","limit":1}' > /dev/null
echo "Cluster warmed. Waiting 5s..."
sleep 5
# The cluster is now hot; subsequent calls are <200ms.
```

Alternatively, set `secondsUntilAutoPause` to a larger value (e.g. `3600`) in the
CDK stack before a multi-hour demo session, then restore it to `300` afterward.
