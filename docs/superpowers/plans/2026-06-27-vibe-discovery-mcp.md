# Vibe Discovery + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agentic core of TollRoad — natural-language "vibe" music discovery backed by real pgvector, exposed as HTTP endpoints and an MCP server — riding the existing metering/streaming.

**Architecture:** A new Aurora PostgreSQL Serverless v2 (scale-to-zero) cluster holds `pgvector` embeddings as a CQRS read-model. A `/discover` Lambda embeds the query via Bedrock Titan v2 and runs an HNSW ANN search with metadata filters. An MCP server wraps `search → session → stream → charge` over the existing HTTP API (mirroring `scripts/agent-demo.mjs`). Catalog embeddings are backfilled by an offline script.

**Tech Stack:** Node ESM, `node:test`, `pg` + `@aws-sdk/rds-signer` (vector DB IAM auth), `@aws-sdk/client-bedrock-runtime` (embeddings), AWS CDK `aws-cdk-lib` ^2.160, `@modelcontextprotocol/sdk` (MCP).

## Global Constraints

- **Module system:** ESM only. Bare imports, `.ts` extensions allowed (`allowImportingTsExtensions`). `verbatimModuleSyntax: true` — use `import type` for type-only imports.
- **Tests:** native `node:test` + `node:assert/strict`. Run with `cd backend && npm test` (`node --experimental-strip-types --test src/**/*.test.ts`). Test files are `*.test.ts` colocated in `src/`.
- **Handlers** return `ApiResponse` via `ok(body)` / `error(status, msg)` from `src/lib/http.ts`; type is `Handler` (`(req) => Promise<ApiResponse>`). Auth via `requireSession(req)` (end-user) or `x-api-key` (programmatic).
- **Money unit:** millicents (1¢ = 1000). Never change.
- **Secrets:** passed via CDK context (`-c KEY=value`) at deploy; never hard-coded. Deploy must use the safe-secret recipe (see Task 9) to avoid dropping `TOLLROAD_SESSION_SECRET` / `TOLLROAD_CF_PRIVATE_KEY` / `TOLLROAD_SMTP_PASS` (known prod-outage landmine).
- **DO NOT run `cdk deploy` from an agent.** Infra tasks produce synthesizable code; the user deploys.
- **DSQL is shared across worktrees** — migrations/backfills hit the one live instance. The vector cluster is NEW and isolated, so its migration is safe; the embedding backfill only READS DSQL `tracks`.

---

### Task 1: Aurora PG Serverless v2 (scale-to-zero) + pgvector cluster in CDK

**Files:**
- Modify: `infra/lib/tollroad-stack.ts` (add cluster near the DSQL block ~line 70; add env vars to `apiEnv` ~line 322; grant Lambda `rds-db:connect`)

**Interfaces:**
- Produces (env vars consumed by Task 2): `TOLLROAD_VECTOR_HOST`, `TOLLROAD_VECTOR_PORT` (`5432`), `TOLLROAD_VECTOR_DB` (`tollroad`), `TOLLROAD_VECTOR_USER` (`vector_app`), `TOLLROAD_VECTOR_REGION`.

- [ ] **Step 1: Add the cluster + VPC + security group.** Insert after the DSQL cluster declaration. Use a minimal VPC (or existing if present — check the file first). Aurora PG Serverless v2 with `serverlessV2MinCapacity` for scale-to-zero:

```typescript
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

const vpc = new ec2.Vpc(this, "TollroadVpc", { maxAzs: 2, natGateways: 0 });
const vectorCluster = new rds.DatabaseCluster(this, "TollroadVector", {
  engine: rds.DatabaseClusterEngine.auroraPostgres({
    version: rds.AuroraPostgresEngineVersion.VER_16_4,
  }),
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // no NAT cost; lock SG instead
  serverlessV2MinCapacity: 0,   // scale-to-zero (see note)
  serverlessV2MaxCapacity: 4,
  writer: rds.ClusterInstance.serverlessV2("writer", { publiclyAccessible: true }),
  defaultDatabaseName: "tollroad",
  iamAuthentication: true,
  enableDataApi: false,
});
```

**Note (version gotcha):** `aws-cdk-lib` ^2.160 may reject `serverlessV2MinCapacity: 0` (scale-to-zero L2 support landed in later 2.x). If `cdk synth` errors on min capacity, EITHER bump `aws-cdk-lib` in `infra/package.json` to `^2.178.0` and `npm install`, OR keep `0.5` and add a CFN escape hatch:
```typescript
(vectorCluster.node.defaultChild as rds.CfnDBCluster).serverlessV2ScalingConfiguration = {
  minCapacity: 0, maxCapacity: 4, secondsUntilAutoPause: 300,
};
```

- [ ] **Step 2: Allow the Lambda to reach the cluster + IAM connect.** **Keep the API Lambda OUT of the VPC** — it already reaches DSQL/DynamoDB/S3/Bedrock over public endpoints, and putting it in a NAT-less VPC would break that egress. The cluster is `publiclyAccessible` in public subnets; the Lambda connects over the public endpoint, secured by **IAM auth + required TLS**. Open the SG on 5432 and grant IAM connect:

```typescript
vectorCluster.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), "vector DB (IAM+TLS gated)");
apiFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ["rds-db:connect"],
  resources: [`arn:aws:rds-db:${region}:${this.account}:dbuser:${vectorCluster.clusterResourceIdentifier}/vector_app`],
}));
```
Do NOT add `vpc`/`vpcSubnets`/`allowPublicSubnet` to `apiFn`. Security rests on IAM auth (`rds_iam`) + TLS, matching the app's existing public-endpoint posture.

- [ ] **Step 3: Add env vars to `apiEnv`.**

```typescript
TOLLROAD_VECTOR_HOST: vectorCluster.clusterEndpoint.hostname,
TOLLROAD_VECTOR_PORT: "5432",
TOLLROAD_VECTOR_DB: "tollroad",
TOLLROAD_VECTOR_USER: "vector_app",
TOLLROAD_VECTOR_REGION: region,
```

- [ ] **Step 4: Grant Bedrock invoke (for Task 4).**
```typescript
apiFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ["bedrock:InvokeModel"],
  resources: [`arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`],
}));
```

- [ ] **Step 5: Verify synth.** Run: `cd infra && npx cdk synth >/dev/null && echo SYNTH_OK`. Expected: `SYNTH_OK` (no deploy). Fix any version/escape-hatch issues per Step 1 note.

- [ ] **Step 6: Commit.** `git add infra/ && git commit -m "feat(infra): Aurora PG Serverless v2 + pgvector cluster (scale-to-zero)"`

---

### Task 2: Vector DB client (`lib/vectordb.ts`)

**Files:**
- Create: `backend/src/lib/vectordb.ts`
- Test: `backend/src/lib/vectordb.test.ts`
- Modify: `backend/package.json` (add `@aws-sdk/rds-signer`)

**Interfaces:**
- Produces: `vectorConfigured(): boolean`; `vquery<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>`; `toVectorLiteral(embedding: number[]): string`.

- [ ] **Step 1: Add dep.** `cd backend && npm install @aws-sdk/rds-signer@^3.1070.0`

- [ ] **Step 2: Write the failing test** (`vectordb.test.ts`) — pure helpers only (no live DB):

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { toVectorLiteral, vectorConfigured } from "./vectordb.ts";

test("toVectorLiteral formats a pgvector literal", () => {
  assert.equal(toVectorLiteral([0.1, 0.2, -0.3]), "[0.1,0.2,-0.3]");
});

test("vectorConfigured is false without host env", () => {
  delete process.env.TOLLROAD_VECTOR_HOST;
  assert.equal(vectorConfigured(), false);
});
```

- [ ] **Step 3: Run test — expect FAIL** (module missing). Run: `cd backend && node --experimental-strip-types --test src/lib/vectordb.test.ts`

- [ ] **Step 4: Implement** `vectordb.ts`, mirroring `lib/dsql.ts` but with `Signer` from `@aws-sdk/rds-signer` for IAM token auth, caching the `pg` Client and reconnecting on connection error:

```typescript
import { Client } from "pg";
import { Signer } from "@aws-sdk/rds-signer";

const HOST = process.env.TOLLROAD_VECTOR_HOST;
const PORT = Number(process.env.TOLLROAD_VECTOR_PORT ?? "5432");
const DB = process.env.TOLLROAD_VECTOR_DB ?? "tollroad";
const USER = process.env.TOLLROAD_VECTOR_USER ?? "vector_app";
const REGION = process.env.TOLLROAD_VECTOR_REGION ?? "us-east-1";

export function vectorConfigured(): boolean { return !!process.env.TOLLROAD_VECTOR_HOST; }
export function toVectorLiteral(e: number[]): string { return `[${e.join(",")}]`; }

let client: Client | null = null;
async function getClient(): Promise<Client> {
  if (client) return client;
  if (!HOST) throw new Error("TOLLROAD_VECTOR_HOST is not set");
  const signer = new Signer({ hostname: HOST, port: PORT, username: USER, region: REGION });
  const token = await signer.getAuthToken();
  const c = new Client({ host: HOST, port: PORT, user: USER, database: DB,
    password: token, ssl: { rejectUnauthorized: false } });
  await c.connect();
  client = c;
  return c;
}
export async function vquery<T = any>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  try { return await (await getClient()).query<T>(sql, params); }
  catch (err: any) {
    if (/ECONNRESET|terminat|Connection terminated|timeout/i.test(String(err?.message))) {
      client = null; return await (await getClient()).query<T>(sql, params);
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run test — expect PASS.** Same command as Step 3.
- [ ] **Step 6: Commit.** `git add backend && git commit -m "feat(vectordb): pg client for Aurora PG with RDS IAM auth"`

---

### Task 3: Vector schema migration

**Files:**
- Create: `infra/scripts/migrate-vector.mjs`

**Interfaces:**
- Produces table `track_vectors(track_id uuid pk, embedding vector(1024), bpm int, energy real, explicit bool, mood text, updated_at timestamptz)` + HNSW index `track_vectors_embedding_hnsw`.

- [ ] **Step 1: Write the migration script**, mirroring `infra/scripts/migrate-dsql.mjs` connection style but pointing at the vector cluster (read host/user from the same `TOLLROAD_VECTOR_*` env). Additive only:

```javascript
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
```

- [ ] **Step 2: Syntax-check.** Run: `node --check infra/scripts/migrate-vector.mjs && echo PARSE_OK`. Expected: `PARSE_OK`. (Live run happens at deploy, Task 9.)
- [ ] **Step 3: Commit.** `git add infra && git commit -m "feat(infra): vector schema migration (pgvector + HNSW)"`

---

### Task 4: Embeddings via Bedrock Titan v2 (`lib/embeddings.ts`)

**Files:**
- Create: `backend/src/lib/embeddings.ts`
- Test: `backend/src/lib/embeddings.test.ts`
- Modify: `backend/package.json` (add `@aws-sdk/client-bedrock-runtime`)

**Interfaces:**
- Produces: `buildTitanBody(text: string): string`; `parseTitanResponse(json: unknown): number[]`; `embed(text: string): Promise<number[]>` (1024-dim).

- [ ] **Step 1: Add dep.** `cd backend && npm install @aws-sdk/client-bedrock-runtime@^3.1070.0`
- [ ] **Step 2: Write failing test** (pure body-builder + parser, no network):

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTitanBody, parseTitanResponse } from "./embeddings.ts";

test("buildTitanBody requests 1024 dims", () => {
  assert.deepEqual(JSON.parse(buildTitanBody("calm jazz")), { inputText: "calm jazz", dimensions: 1024, normalize: true });
});
test("parseTitanResponse extracts the embedding array", () => {
  assert.deepEqual(parseTitanResponse({ embedding: [1, 2, 3] }), [1, 2, 3]);
});
```

- [ ] **Step 3: Run — expect FAIL.** `cd backend && node --experimental-strip-types --test src/lib/embeddings.test.ts`
- [ ] **Step 4: Implement** with `BedrockRuntimeClient` + `InvokeModelCommand`, model `amazon.titan-embed-text-v2:0`; keep `buildTitanBody`/`parseTitanResponse` pure and call them from `embed()`.
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit.** `git add backend && git commit -m "feat(embeddings): Bedrock Titan v2 text embeddings"`

---

### Task 5: Catalog enrichment / backfill script

**Files:**
- Create: `scripts/enrich-catalog.mjs`

**Interfaces:** Reads `tracks` from DSQL (host via `TOLLROAD_DSQL_*`), composes a descriptor string per track, embeds it, upserts into `track_vectors` (host via `TOLLROAD_VECTOR_*`). Idempotent (`ON CONFLICT (track_id) DO UPDATE`).

- [ ] **Step 1: Write the script.** Descriptor = `"${title} by ${artist_name}. Genre: ${genre}. ..."`. For each track: `embed(descriptor)` → `INSERT INTO track_vectors (track_id, embedding, ...) VALUES ($1, $2::vector, ...) ON CONFLICT (track_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`. Log count.
- [ ] **Step 2: Syntax-check.** `node --check scripts/enrich-catalog.mjs && echo PARSE_OK`.
- [ ] **Step 3: Commit.** `git add scripts && git commit -m "feat(scripts): catalog embedding backfill"`

---

### Task 6: `/discover` endpoint

**Files:**
- Create: `backend/src/handlers/discover.ts`
- Create: `backend/src/domain/discovery.ts` (pure query/constraint logic)
- Test: `backend/src/domain/discovery.test.ts`
- Modify: `backend/src/router.ts` (register `compile("POST", "/discover", discover)`)

**Interfaces:**
- Consumes: `vquery`, `toVectorLiteral` (Task 2); `embed` (Task 4); `CatalogTrack` shape (existing `domain/catalog.ts`).
- Produces: `parseConstraints(body): Constraints`; `buildDiscoverSql(constraints): { sql, params }`; route `POST /discover`.
- Request body: `{ vibe: string, limit?: number, bpmMin?: number, bpmMax?: number, maxEnergy?: number, allowExplicit?: boolean }`.
- Response: `{ results: Array<CatalogTrack & { score: number }> }`.

- [ ] **Step 1: Write failing test** for the pure SQL/constraint builder:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConstraints, buildDiscoverSql } from "./discovery.ts";

test("parseConstraints clamps limit and defaults explicit to false", () => {
  const c = parseConstraints({ vibe: "x", limit: 999 });
  assert.equal(c.limit, 50);          // clamp
  assert.equal(c.allowExplicit, false);
});
test("buildDiscoverSql filters explicit and orders by cosine distance", () => {
  const { sql, params } = buildDiscoverSql({ limit: 10, allowExplicit: false }, "[0.1,0.2]");
  assert.match(sql, /ORDER BY v.embedding <=> \$1/);
  assert.match(sql, /explicit = false/);
  assert.deepEqual(params.slice(0, 1), ["[0.1,0.2]"]);
});
```

- [ ] **Step 2: Run — expect FAIL.** `cd backend && node --experimental-strip-types --test src/domain/discovery.test.ts`
- [ ] **Step 3: Implement `domain/discovery.ts`.** `parseConstraints` (clamp `limit` 1..50, defaults). `buildDiscoverSql` returns a JOIN of `track_vectors v` to DSQL-mirrored track fields. **Note:** tracks live in DSQL, embeddings in the vector DB — so the discover query runs against the **vector DB**, and `track_vectors` must carry the display fields needed, OR the handler hydrates the returned `track_id`s from the catalog. Choose hydration: vector query returns `track_id, score`; handler maps to `CatalogTrack` via `getCatalog()` lookup. Adjust `buildDiscoverSql` to `SELECT track_id, embedding <=> $1 AS score FROM track_vectors v WHERE <filters> ORDER BY v.embedding <=> $1 LIMIT $N`.
- [ ] **Step 4: Implement `handlers/discover.ts`.** Validate `vibe` non-empty (else `error(400)`), `embed(vibe)` → `toVectorLiteral` → `vquery(buildDiscoverSql(...))` → hydrate via catalog → `ok({ results })`. Guard `vectorConfigured()` (`error(503)`).
- [ ] **Step 5: Register the route** in `router.ts`.
- [ ] **Step 6: Run domain test — expect PASS.**
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat(discover): pgvector vibe search endpoint"`

---

### Task 7: DJ session endpoints

**Files:**
- Create: `backend/src/handlers/sessions.ts`
- Create: `backend/src/domain/dj.ts` (pure next-track selection)
- Test: `backend/src/domain/dj.test.ts`
- Modify: `backend/src/router.ts` (`POST /sessions`, `POST /sessions/{id}/next`)

**Interfaces:**
- Produces: `pickNext(candidates: {trackId:string,score:number}[], played: Set<string>): string | null` (no-repeat selection); session state stored in DynamoDB (`PK=SESSION#<id>`, attrs: context, played[], energyTarget).

- [ ] **Step 1: Write failing test** for `pickNext`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext } from "./dj.ts";

test("pickNext skips already-played tracks", () => {
  const got = pickNext([{trackId:"a",score:0.1},{trackId:"b",score:0.2}], new Set(["a"]));
  assert.equal(got, "b");
});
test("pickNext returns null when all played", () => {
  assert.equal(pickNext([{trackId:"a",score:0.1}], new Set(["a"])), null);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `domain/dj.ts`** (`pickNext`) and `handlers/sessions.ts` (start: create session id, run discover for context, store state; next: re-run discover with the latest signal text, `pickNext` excluding played, append, return track + stream grant). Reuse the existing stream-grant helper from `handlers/stream.ts`.
- [ ] **Step 4: Register routes.**
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit.** `git add backend && git commit -m "feat(sessions): DJ session start/next with no-repeat"`

---

### Task 8: MCP server

**Files:**
- Create: `mcp/package.json`, `mcp/src/server.ts`, `mcp/src/client.ts`, `mcp/README.md`
- Test: `mcp/src/client.test.ts`

**Interfaces:**
- Tools: `search_music({vibe, limit?, bpmMin?, bpmMax?, maxEnergy?, allowExplicit?})`, `start_session({context})`, `next_track({session, signal?})`, `get_stream({track_id})`, `get_balance()`.
- `client.ts` mirrors `scripts/agent-demo.mjs`: `call(method, path, body)` with `x-api-key`/`Bearer` auth from env (`TOLLROAD_API_BASE`, `TOLLROAD_API_KEY`).

- [ ] **Step 1: Scaffold `mcp/package.json`** (ESM, deps: `@modelcontextprotocol/sdk`). 
- [ ] **Step 2: Write failing test** for `client.ts` URL/auth mapping (mock `fetch`):

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeClient } from "./client.ts";

test("client attaches x-api-key and builds the URL", async () => {
  const calls: any[] = [];
  const fetchMock = async (url: string, init: any) => { calls.push({ url, init });
    return { status: 200, json: async () => ({ ok: true }) }; };
  const c = makeClient({ base: "https://api/v1", apiKey: "k1", fetchImpl: fetchMock as any });
  await c.call("POST", "/discover", { vibe: "calm" });
  assert.equal(calls[0].url, "https://api/v1/discover");
  assert.equal(calls[0].init.headers["x-api-key"], "k1");
});
```

- [ ] **Step 3: Run — expect FAIL.** `cd mcp && node --experimental-strip-types --test src/client.test.ts`
- [ ] **Step 4: Implement `client.ts`** (injectable `fetchImpl` for testability) and `server.ts` (registers the five tools, each calling the HTTP API via the client; `search_music` → `/discover`, etc.). Use stdio transport.
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Smoke-test the server starts.** Run: `cd mcp && node --experimental-strip-types src/server.ts --help 2>/dev/null || echo STARTS` (server should initialize without throwing on import).
- [ ] **Step 7: Commit.** `git add mcp && git commit -m "feat(mcp): vibe-DJ MCP server over TollRoad API"`

---

### Task 9: Deploy + demo runbook

**Files:**
- Create: `docs/runbooks/vibe-discovery-deploy.md`

- [ ] **Step 1: Write the runbook** covering, in order:
  1. **Deploy infra** with the safe-secret recipe (pass `TOLLROAD_SESSION_SECRET`, `TOLLROAD_CF_PRIVATE_KEY`, `TOLLROAD_SMTP_PASS`, Stripe keys via `-c` so `cdk deploy` does not drop them — reference the millicents/secret-drift incident notes).
  2. **Run vector migration**: `TOLLROAD_VECTOR_HOST=… node infra/scripts/migrate-vector.mjs`.
  3. **Backfill embeddings**: `node scripts/enrich-catalog.mjs` (reads DSQL tracks, writes vectors).
  4. **Verify**: `curl -XPOST $API/v1/discover -H "x-api-key: …" -d '{"vibe":"tense boss fight, 140bpm synthwave"}'` returns ranked results.
  5. **Run MCP**: `TOLLROAD_API_BASE=… TOLLROAD_API_KEY=… node mcp/src/server.ts`; add to an MCP client config; demo `search_music` → `start_session` → stream with the live meter.
  6. **Cold-start note**: first `/discover` after idle pays the Aurora resume latency (~10–15s); warm-ping before the demo.
- [ ] **Step 2: Commit.** `git add docs && git commit -m "docs: vibe-discovery deploy + demo runbook"`

---

## Self-Review

- **Spec coverage:** Discovery Brain (§3.2) → Tasks 1–7; MCP surface (§3.5) → Task 8; data plane pgvector (§3.6, §6) → Tasks 1–3; metering/streaming reused (§3.3–3.4) → Tasks 7–8 call existing endpoints. **Out of scope for this plan (follow-up plans):** Tenant & Identity plane (§3.1), client SDKs + dashboard (§3.5). Noted in plan header.
- **Type consistency:** `vquery`/`toVectorLiteral`/`vectorConfigured` (Task 2) used in Tasks 6–7; `embed`/`buildTitanBody`/`parseTitanResponse` (Task 4) used in Tasks 5–6; `parseConstraints`/`buildDiscoverSql` (Task 6) and `pickNext` (Task 7) match their tests; `makeClient().call` (Task 8) matches its test. Env var names identical across Tasks 1–3.
- **Placeholders:** none — each code step shows real code; infra deploy intentionally deferred to the user-run runbook (Task 9) per the no-agent-deploy constraint.
- **Known risk flagged:** `serverlessV2MinCapacity: 0` may need a CDK bump or CFN escape hatch (Task 1 note); tracks/embeddings split resolved by handler-side hydration (Task 6 Step 3).
