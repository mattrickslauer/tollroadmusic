# TollRoad — Polyglot CQRS Migration (Design Spec & Node Graph)

**Date:** 2026-06-25 · **Branch:** `worktree-polyglot-cqrs` · **Target:** one PR to `main`
**Deadline context:** H0 hackathon, Jun 29. Track 3 (million-scale). Judges are the AWS Databases bench.

---

## 1. Decision (locked)

Go **full polyglot CQRS**:

- **Command side (writes / hot path) → Amazon DynamoDB.** The per-minute money path —
  conditional balance debit + meter event — runs in DynamoDB: single-digit-ms conditional
  writes, no connection model, horizontal partitioning. This is the only one of the three
  allowed AWS DBs built for ~16–23K writes/sec at a million concurrent streams.
- **Query side (reads / system-of-record) → Amazon Aurora DSQL.** DynamoDB Streams →
  **projector Lambda** → DSQL holds the append-only `royalty_ledger` (SoR), the per-artist/day
  summaries, and the reconciliation balance. DSQL scales to zero between projection runs and
  serves cheap relational reads, *because* DynamoDB absorbs the hot path.

This **repairs the broken rollup**: today the synchronous DSQL ledger write front-runs the
rollup, so the projector always hits `ON CONFLICT DO NOTHING` and `artist_daily_summary` never
updates. After this change the **command writes only to DynamoDB**, and **DSQL is built entirely
by the projector** — the conflict (and the bug) disappears by construction.

### Scope of THIS PR
- CQRS core (command path, Streams, projector, read models).
- Cheap, unambiguous security hardening: separate OTP pepper, CORS fail-closed in prod,
  least-privilege DSQL role.
- **Out of scope (fast-follow PRs):** the server-authoritative meter (#4, design captured in §6)
  and the self-serve API-key/quota provider (#6).

---

## 2. Consistency model (the load-bearing rule)

There are **two balances**:

| Balance | Store | Role | Read by |
|---|---|---|---|
| **Authoritative real-time balance** | DynamoDB balance item | The thing the conditional debit guards; can never go negative | live meter, `/charge` response, `/balance` real-time field |
| **Reconciliation balance** | DSQL `listener_profiles.balance_cents` | Eventually-consistent projection for audit/history | dashboards, statements |

**Rule:** anything that gates money or playback in real time reads **DynamoDB**. Anything
historical/relational/BI reads **DSQL**. The projector is the only writer of the DSQL ledger,
summaries, and reconciliation balance. Top-ups credit the **DynamoDB** balance (authoritative)
and emit an event the projector reconciles into DSQL.

**Proof-of-recent-payment for the stream gate** (`hasRecentCharge`) reads the **DynamoDB** meter
events (real-time), not the DSQL ledger (lagging).

Idempotency key everywhere: `<user>#<track>#<minuteEpoch>`. The projector is at-least-once and
must be idempotent (`ON CONFLICT DO NOTHING` on `royalty_ledger.idempotency_key`; summary +
reconciliation increments only when the ledger insert was new).

---

## 3. Data model

### DynamoDB (command store) — single table `tollroad`
- **Balance item:** `PK=USER#<id>`, `SK=BAL`, attr `balanceCents` (Number). Debit =
  `UpdateItem ... ADD balanceCents :neg ConditionExpression balanceCents >= :amt`. Top-up =
  `ADD balanceCents :credit`.
- **Meter event:** `PK=USER#<id>`, `SK=EVT#<minuteEpoch>#<trackId>`, `type=METER`,
  `idempotencyKey`, `trackId`, `artistId`, `amountCents`, `minuteEpoch`, GSI1 (`ARTIST#<id>`),
  TTL. `ConditionExpression attribute_not_exists(PK,SK)` → one stream INSERT per unique minute.
- **Top-up event:** `PK=USER#<id>`, `SK=TOPUP#<paymentRef>`, `type=TOPUP`, idempotent on
  `paymentRef`. Drives the projector's DSQL reconciliation + `wallet_topups` insert.
- Stream view: `NEW_AND_OLD_IMAGES`. Stream filter: `INSERT` where `type IN (METER, TOPUP)`.

### Aurora DSQL (read models / SoR) — additive migration only
- `royalty_ledger` (exists) — now written **only** by the projector.
- `artist_daily_summary` (exists) — projector upserts.
- `listener_profiles.balance_cents` (exists) — now the **reconciliation** balance.
- `wallet_topups` (exists) — projector inserts.
- **NEW** `projector_checkpoint(shard_id TEXT PK, last_seq TEXT, updated_at TIMESTAMPTZ)` —
  optional observability of stream progress (additive).
- All migrations **forward-only, additive, no drops** (shared DSQL instance across worktrees).

---

## 4. Node graph (tasks + dependencies)

```
            ┌────────────────────────────────────────────────────┐
            │ T0  Spec + interface contract  (this doc)  [DONE]   │
            └───────────────┬───────────────────────┬────────────┘
                            │                       │
              ┌─────────────▼──────────┐   ┌────────▼─────────────────┐
              │ T1 INFRA & PROJECTOR   │   │ T2 COMMAND PATH (writes) │
              │ owns infra/**          │   │ owns charge/meter/billing│
              │ • Dynamo table (bal+   │   │ • /charge → Dynamo debit │
              │   meter+topup, streams)│   │ • emit meter event       │
              │ • projector Lambda     │   │ • topup → Dynamo credit  │
              │   Streams→DSQL ledger+ │   │ • real-time balance read │
              │   summary+reconcile    │   │ • hasRecentCharge→Dynamo │
              │ • additive migration   │   │ • stream gate uses it    │
              │ • least-priv DSQL role │   └────────┬─────────────────┘
              └─────────────┬──────────┘            │
                            │                        │
              ┌─────────────▼────────────┐   ┌───────▼──────────────────┐
              │ T3 SECURITY HARDENING    │   │ (T1,T2 both feed T4)     │
              │ owns cors/otp/jwt/dsql   │   └───────┬──────────────────┘
              │ • OTP pepper (separate)  │           │
              │ • CORS fail-closed prod  │           │
              │ • least-priv user (w/T1) │           │
              │ • README/openapi notes   │           │
              └─────────────┬────────────┘           │
                            └───────────┬────────────┘
                            ┌───────────▼─────────────────────────┐
                            │ T4 INTEGRATE + VERIFY (orchestrator) │
                            │ • typecheck + npm test               │
                            │ • run additive migration on DSQL     │
                            │ • agent-demo loop end-to-end         │
                            │ • commit, push, open PR, local check │
                            └──────────────────────────────────────┘
```

**Parallelizable now:** T1, T2, T3 (disjoint file ownership). **Blocked:** T4 on {T1,T2,T3}.

### File-ownership partition (NO agent touches another's files)
- **T1 (Infra/Projector):** `infra/**` only — `infra/lib/tollroad-stack.ts`,
  `infra/lambda/` (projector), `infra/scripts/migrate-dsql.mjs`.
- **T2 (Command):** `backend/src/handlers/charge.ts`, `backend/src/handlers/wallet.ts`,
  `backend/src/handlers/stream.ts`, `backend/src/domain/billing.ts`, `backend/src/domain/meter.ts`,
  new `backend/src/domain/wallet-store.ts` (DynamoDB balance/meter/topup ops).
- **T3 (Security/docs):** `backend/src/lib/cors.ts`, `backend/src/domain/otp.ts`,
  `backend/src/lib/jwt.ts`, `backend/src/lib/dsql.ts` (connection user only),
  `backend/README.md`, `backend/openapi.yaml`, `README.md`.

Shared low-level files NOT to be edited by command/security agents except as noted: `router.ts`
(stable), `lib/http.ts` (stable). If an interface change is unavoidable, leave a `// CONTRACT:`
comment and flag it for T4 instead of editing across slices.

---

## 5. Interface contract (fixed signatures so slices compose)

`backend/src/domain/wallet-store.ts` (NEW, owned by T2) — the DynamoDB command store:
```ts
export function walletStoreConfigured(): boolean;          // TOLLROAD_TABLE set
export async function debitMinute(i: { accountId; trackId; artistId; amountCents; minuteEpoch }):
  Promise<{ ok: true; balanceCents: number; charged: boolean } | { ok: false; reason: "insufficient"; balanceCents: number }>;
export async function creditBalance(i: { accountId; paymentRef; amountCents; method; status }):
  Promise<{ credited: boolean; balanceCents: number }>;
export async function getRealtimeBalance(accountId: string): Promise<number>;
export async function hasRecentMeter(accountId: string, trackId: string, windowSec?: number): Promise<boolean>;
```
- `charge.ts` calls `debitMinute` (replaces `chargeMinute`'s DSQL write); on `ok && charged`
  the conditional `attribute_not_exists` meter-event INSERT is what fires the stream → projector.
- `wallet.ts` `/balance` returns `{ balanceCents: getRealtimeBalance(), history: <DSQL> }`.
- `stream.ts` gate calls `hasRecentMeter` (Dynamo), not `hasRecentCharge` (DSQL).
- `billing.ts` keeps the **read** helpers (`getListeningHistory`, etc.) on DSQL; its
  `chargeMinute`/`creditTopup` become thin wrappers over `wallet-store` OR are removed in favor of
  it — T2's call. DSQL stays the projector's job for the ledger.

Projector Lambda (T1) consumes Stream records and, per record `type`:
- `METER` → `INSERT royalty_ledger ... ON CONFLICT (idempotency_key) DO NOTHING`; if inserted,
  upsert `artist_daily_summary` and decrement `listener_profiles.balance_cents` (reconcile).
- `TOPUP` → `INSERT wallet_topups ... ON CONFLICT (payment_ref) DO NOTHING`; if inserted, add to
  `listener_profiles.balance_cents`. OCC `40001` retry with backoff.

Env: `TOLLROAD_TABLE` (Dynamo) becomes **required** for the command path in prod; local dev keeps
a graceful fallback (if unset, `walletStoreConfigured()` is false → handlers return 503 "billing
not configured", same posture as today, OR an opt-in `TOLLROAD_LOCAL_DSQL_BILLING=1` keeps the old
DSQL-direct path for laptop demos — T2's call, document whichever).

---

## 6. Fast-follow design — server-authoritative meter (#4) [NOT in this PR]

Capture now so it's ready:
- Play start → `POST /v1/stream/{id}/session` → server creates a **streaming session**
  (sessionId, trackId, accountId, issuedAt) and returns a short-TTL **HMAC-signed heartbeat
  token** (signed with a server secret, carrying sessionId + monotonic seq + nextDueAt).
- Each renewal → `POST /v1/charge` must present the **prior** heartbeat token; server verifies
  signature + monotonic seq + that elapsed wall-clock matches the claimed minute (±skew), then
  performs the Dynamo debit and issues the next token. No valid chain → no recorded minute.
- Kills client forgery, wash-streaming (self-streaming yields no valid heartbeat chain), and
  replay. This is also the primitive partners/agents present for trusted usage ingestion → the
  bridge to the #6 provider and a real "402 system of music."

---

## 7. Security hardening (T3, in this PR)
1. **Separate OTP pepper** — `otp.ts` must use `TOLLROAD_OTP_PEPPER`, not
   `TOLLROAD_SESSION_SECRET`. Fall back to session secret only if unset (with a `console.warn`),
   so existing envs don't break, but `.env.example` documents the new var.
2. **CORS fail-closed in prod** — when `NODE_ENV=production` and `TOLLROAD_ALLOWED_ORIGINS` is
   empty, do **not** echo arbitrary origins with credentials; return no ACAO (block). Local dev
   keeps the permissive echo.
3. **Least-privilege DSQL role** — stop connecting as `admin`; use a role with DML only
   (`TOLLROAD_DSQL_USER`, default still `admin` to avoid breaking the demo, documented). The
   projector keeps its own role/grant via T1's CDK.

---

## 8. Verification (T4)
- `npm run typecheck` and `npm test` green in `backend/`.
- `infra` builds (`tsc`/cdk synth as configured).
- Run the additive migration against shared DSQL (user approved).
- `scripts/agent-demo.mjs` against local server: discover → 402 → charge (Dynamo debit) →
  stream grant. Confirm a meter event lands and (when wired) the projector path is exercised.
- Commit, push `worktree-polyglot-cqrs`, open PR to `main`. The worktree IS the local checkout.
```
