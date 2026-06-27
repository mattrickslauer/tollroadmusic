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
- **NEW:** a Bedrock `InvokeModel` IAM grant on the Lambda's execution role
  (`amazon.titan-embed-text-v2:0`). No new database resources are added — vectors
  live in the existing DynamoDB single-table under `PK="TVEC"`.

CDK outputs the `ApiBaseUrl`, `DsqlEndpoint`, and `TableName` on completion — note them.

---

## Step 2 — Enable Bedrock model access

If not already enabled in the account, grant model access for the embedding model:

1. Open **AWS Console → Bedrock → Model access** in `us-east-1`.
2. Enable **Titan Embed Text V2** (`amazon.titan-embed-text-v2:0`).
3. Wait for status to show **Access granted** (usually under a minute).

This is a one-time, per-account step — skip if the model is already enabled.

---

## Step 3 — Backfill catalog embeddings

Reads every track from Aurora DSQL, builds a text descriptor (`"<title> by <artist>.
Genre: <genre>."`), embeds it via Bedrock Titan v2 (`amazon.titan-embed-text-v2:0`,
1024 dimensions), and writes the vector into the DynamoDB `TVEC` partition. Idempotent
(PutItem overwrites on re-run) — safe to re-run or resume after a partial run.

```bash
TOLLROAD_DSQL_ENDPOINT=<DsqlEndpoint-from-cdk-output> \
TOLLROAD_TABLE=<TableName-from-cdk-output> \
node scripts/enrich-catalog.mjs
```

Retrieve the CDK outputs if you didn't copy them during deploy:

```bash
aws cloudformation describe-stacks \
  --stack-name TollroadStack \
  --query "Stacks[0].Outputs[?OutputKey=='DsqlEndpoint' || OutputKey=='TableName'].{Key:OutputKey,Value:OutputValue}" \
  --output table
```

Optional override:

| Variable | Default | Purpose |
|---|---|---|
| `TOLLROAD_DSQL_REGION` | `us-east-1` | AWS region for DSQL + Bedrock |

The script authenticates to DSQL using an IAM admin token (your shell's AWS creds)
and to Bedrock the same way. It logs progress every 10 tracks:

```
Connected to DSQL source.
Fetched 80 tracks from DSQL.
embedded 10/80 — last: "Neon Drift by Axon Valley. Genre: Synthwave."
...
Done. Upserted 80 track vectors to DynamoDB.
```

---

## Step 4 — Verify the discovery endpoint

```bash
API=https://<ApiBaseUrl-from-cdk-output>

curl -s -XPOST "$API/v1/discover" \
  -H "x-api-key: <app-api-key>" \
  -H "content-type: application/json" \
  -d '{"vibe":"tense boss fight synthwave"}' | python3 -m json.tool
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

`score` is cosine similarity (higher = better match). Only `vibe` (required) and
`limit` (int 1–50, optional) are accepted request fields.

---

## Step 5 — Run the MCP server

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
end-user session context (passes `Authorization: Bearer` on each tool call — required
for session tools that touch the user wallet).

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
| `search_music` | Discover tracks by vibe/mood with optional limit. Calls `POST /v1/discover`. |
| `start_session` | Start a DJ session queue. Calls `POST /v1/sessions`. Returns a `session` ID. |
| `next_track` | Advance the session to the next track (optional `signal` hint). Calls `POST /v1/sessions/{id}/next`. |
| `get_stream` | Get a signed CloudFront URL for a track. Calls `GET /v1/stream/{trackId}`. Returns 402 if the balance is zero. |
| `get_balance` | Check the current wallet balance. Calls `GET /v1/balance`. |

**Demo flow for a live session:**

```
search_music(vibe="tense boss fight synthwave", limit=5)
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
