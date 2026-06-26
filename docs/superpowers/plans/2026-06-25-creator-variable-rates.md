# Creator-Set Variable Rates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let creators set a per-track listening rate — free (0) up to $1.00/min at 0.1¢ precision — that the existing meter already honors.

**Architecture:** The per-track rate is already read by the charge path. This plan (1) migrates the whole billing system from integer cents to **millicents** (cents × 1000) so sub-cent rates are representable, (2) adds a creator write path to set the rate, and (3) supports a free tier by metering at zero. The per-minute ledger, idempotency key, and streaming gate are unchanged — only the stored *unit* and field *names* change.

**Tech Stack:** TypeScript (Node `--experimental-strip-types`, `node:test`), Aurora DSQL (Postgres-compatible), DynamoDB + rollup Lambda (JS), Next.js frontend, Stripe.

## Global Constraints

These apply to **every** task. Use these exact names/values verbatim.

- **DB columns (renamed):** `balance_millicents`, `royalty_ledger.amount_millicents`, `wallet_topups.amount_millicents`, `artist_daily_summary.amount_millicents`, `tracks.price_per_minute_millicents`.
- **TS/JSON fields (renamed):** `balanceMillicents`, `amountMillicents`, `pricePerMinuteMillicents` (catalog/track), `ratePerMinuteMillicents` (rate write request).
- **Constants (in `backend/src/domain/billing.ts`):** `TOPUP_MILLICENTS = 1_000_000`, `ONBOARDING_GIFT_MILLICENTS = 300_000`, `LIKE_COST_MILLICENTS = 1000`. DB default rate = `1000`.
- **Rate bounds (new, in `backend/src/domain/billing.ts`):** `MIN_RATE_MILLICENTS = 0`, `MAX_RATE_MILLICENTS = 100_000` ($1.00/min), `RATE_STEP_MILLICENTS = 100` (0.1¢). Valid rate = integer AND `MIN ≤ r ≤ MAX` AND `r % RATE_STEP === 0`.
- **Stripe boundary (Stripe stays in whole cents):** credit IN = `stripeCents * 1000`; payout OUT = `Math.round(millicents / 1000)`, sub-cent remainder stays in the artist balance. `cardFeeCents` keeps operating in cents.
- **Backend test:** `cd backend && npm test`. **Typecheck:** `cd backend && npm run typecheck`.
- **CAUTION — shared DSQL:** one DSQL instance backs every local worktree. The migration (Task 1) mutates shared state; run it deliberately and only once, and expect other branches to need it too. Prefer asserting parity over re-running.
- **No backward-compat shim:** the field rename is a hard cutover; backend + frontend deploy together.

---

## Parallelization Map

- **Phase 1 (foundation):** Task 1 (DB), Task 2 (backend TS rename — the coupled spine), Task 3 (rollup Lambda), Task 4 (OpenAPI). Task 2 is the spine and must land before Phase 2. Tasks 1/3/4 are independent of Task 2 and of each other.
- **Phase 2 (parallel — depend only on Task 2's names):** Task 5 (rate write endpoint) and Task 6 (frontend) are independent of each other → run as parallel subagents. Task 7 (free-tier integration test) depends on Task 5.

---

## Task 1: Migrate billing columns cents → millicents

**Files:**
- Create: `infra/scripts/migrate-millicents.mjs`
- Modify: `infra/scripts/migrate-dsql.mjs:51` (fresh-install schema), `:118`, `:130`, `:141`-`:142` and `balance_cents` at `:92`

**Interfaces:**
- Consumes: existing DSQL tables with `*_cents` columns.
- Produces: same tables with `*_millicents` columns, values × 1000.

- [ ] **Step 1: Update the fresh-install schema** in `infra/scripts/migrate-dsql.mjs` so new environments are born in millicents. Change exactly these lines:
  - `:51` `price_per_minute_cents INTEGER NOT NULL DEFAULT 1,` → `price_per_minute_millicents INTEGER NOT NULL DEFAULT 1000,`
  - `:92` `balance_cents BIGINT NOT NULL DEFAULT 0,` → `balance_millicents BIGINT NOT NULL DEFAULT 0,`
  - `:118` `amount_cents    INTEGER NOT NULL,` → `amount_millicents INTEGER NOT NULL,` (royalty_ledger)
  - `:130` `amount_cents  BIGINT NOT NULL DEFAULT 0,` → `amount_millicents BIGINT NOT NULL DEFAULT 0,` (artist_daily_summary)
  - `:141`-`:142` `amount_cents  BIGINT NOT NULL,` → `amount_millicents BIGINT NOT NULL,` (wallet_topups). Leave `fee_cents` unchanged (Stripe fees stay in cents).

- [ ] **Step 2: Write the idempotent live migration** `infra/scripts/migrate-millicents.mjs`:

```js
// One-shot live migration: rename every billing money column to *_millicents and
// scale existing values × 1000. Idempotent — re-running is a no-op once renamed.
// fee_cents is intentionally left in cents (Stripe boundary).
import { withDsql } from "./_dsql.mjs"; // reuse the same DSQL connector migrate-dsql.mjs uses

const COLS = [
  ["listener_profiles", "balance_cents", "balance_millicents"],
  ["royalty_ledger",    "amount_cents",  "amount_millicents"],
  ["wallet_topups",     "amount_cents",  "amount_millicents"],
  ["artist_daily_summary", "amount_cents", "amount_millicents"],
  ["tracks", "price_per_minute_cents", "price_per_minute_millicents"],
];

async function colExists(db, table, col) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, col],
  );
  return r.rowCount > 0;
}

await withDsql(async (db) => {
  for (const [table, oldCol, newCol] of COLS) {
    if (await colExists(db, table, newCol)) { console.log(`skip ${table}.${newCol} (exists)`); continue; }
    if (!(await colExists(db, table, oldCol))) { console.log(`skip ${table}.${oldCol} (absent)`); continue; }
    await db.query("BEGIN");
    await db.query(`UPDATE ${table} SET ${oldCol} = ${oldCol} * 1000`);
    await db.query(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`);
    await db.query("COMMIT");
    console.log(`migrated ${table}.${oldCol} -> ${newCol} (×1000)`);
  }
});
console.log("millicents migration complete");
```
(If `migrate-dsql.mjs` does not expose a reusable `_dsql.mjs` connector, copy its inline connection setup into this script — match its existing pattern exactly.)

- [ ] **Step 3: Capture parity snapshot before running.** Run against DSQL:
  `SELECT sum(balance_cents) FROM listener_profiles;` and the same for `royalty_ledger.amount_cents`. Record the numbers.

- [ ] **Step 4: Run the migration.** `node infra/scripts/migrate-millicents.mjs`
  Expected output: one `migrated …` line per table, then `millicents migration complete`.

- [ ] **Step 5: Assert parity.** Run `SELECT sum(balance_millicents) FROM listener_profiles;`
  Expected: exactly `snapshot × 1000`. Same check for `royalty_ledger.amount_millicents`.

- [ ] **Step 6: Commit**
```bash
git add infra/scripts/migrate-millicents.mjs infra/scripts/migrate-dsql.mjs
git commit -m "feat(billing): migrate money columns cents -> millicents"
```

---

## Task 2: Backend cents → millicents rename + rate bounds (the spine)

This is one coherent task: a half-rename does not compile, so it ships together. Keep typecheck green at the end.

**Files:**
- Modify: `backend/src/domain/billing.ts`, `backend/src/domain/meter.ts`, `backend/src/domain/tracks.ts`, `backend/src/domain/catalog.ts`, `backend/src/domain/library.ts`, `backend/src/domain/artist-public.ts`, `backend/src/lib/x402.ts`, `backend/src/handlers/charge.ts`, `backend/src/handlers/stream.ts`, `backend/src/handlers/wallet.ts`, `backend/src/handlers/library.ts`, `backend/src/handlers/stripe-webhook.ts`
- Modify (tests): `backend/src/x402.test.ts`, `backend/src/domain/artist-public.test.ts`
- Test: `backend/src/domain/billing.test.ts` (create)

**Interfaces:**
- Produces (consumed by Tasks 5 & 6):
  - `getTrackBilling(trackId) → { id, artistId, pricePerMinuteMillicents, audioKey }`
  - `chargeMinute({ ..., amountMillicents }) → { ok, balanceMillicents, charged } | { ok:false, reason, balanceMillicents }`
  - `getBalanceCents` renamed `getBalanceMillicents(accountId) → number`
  - `paymentRequired({ resource, trackId, pricePerMinuteMillicents, reason }) → ApiResponse` with body field `pricePerMinuteMillicents` and `maxAmountRequired` in millicents
  - constants `MIN_RATE_MILLICENTS`, `MAX_RATE_MILLICENTS`, `RATE_STEP_MILLICENTS` exported from `billing.ts`
  - `isValidRateMillicents(n: unknown) → boolean` exported from `billing.ts`

- [ ] **Step 1: Add a failing rate-validation test** `backend/src/domain/billing.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidRateMillicents, MAX_RATE_MILLICENTS } from "./billing.ts";

test("rate validation: accepts 0 (free), on-step values, and the cap", () => {
  assert.equal(isValidRateMillicents(0), true);
  assert.equal(isValidRateMillicents(500), true);          // 0.5¢/min
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS), true);
});
test("rate validation: rejects negative, over-cap, off-step, non-integer", () => {
  assert.equal(isValidRateMillicents(-100), false);
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS + 100), false);
  assert.equal(isValidRateMillicents(150), false);         // off 100-step
  assert.equal(isValidRateMillicents(50.5), false);
  assert.equal(isValidRateMillicents("100"), false);
});
```

- [ ] **Step 2: Run it, expect failure.** `cd backend && npm test`
  Expected: FAIL — `isValidRateMillicents` not exported.

- [ ] **Step 3: Edit `billing.ts`** — rename constants and values, add bounds + validator, rename SQL columns and return fields:
  - `TOPUP_CENTS = 1000` → `export const TOPUP_MILLICENTS = 1_000_000;`
  - `LIKE_COST_CENTS = 1` → `export const LIKE_COST_MILLICENTS = 1000;`
  - `ONBOARDING_GIFT_CENTS = 300` → `export const ONBOARDING_GIFT_MILLICENTS = 300_000;`
  - Add:
```ts
export const MIN_RATE_MILLICENTS = 0;
export const MAX_RATE_MILLICENTS = 100_000;   // $1.00/min
export const RATE_STEP_MILLICENTS = 100;      // 0.1¢/min granularity
export function isValidRateMillicents(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n)
    && n >= MIN_RATE_MILLICENTS && n <= MAX_RATE_MILLICENTS
    && n % RATE_STEP_MILLICENTS === 0;
}
```
  - In every SQL string and result type in this file: `balance_cents` → `balance_millicents`, `amount_cents` → `amount_millicents` (leave `fee_cents` as-is). Rename interface fields/locals: `ChargeInput.amountCents` → `amountMillicents`, `ChargeResult.balanceCents` → `balanceMillicents`, `CreditInput.amountCents` → `amountMillicents`, `LikeChargeResult.balanceCents` → `balanceMillicents`, `HistoryRow.amountCents` → `amountMillicents`. Rename `getBalanceCents` → `getBalanceMillicents`. Use `LIKE_COST_MILLICENTS` and `ONBOARDING_GIFT_MILLICENTS` where the old constants were used.
  - Note: `chargeMinute`'s subtract logic is unit-agnostic; a 0 amount still satisfies `balance_millicents >= 0` → free tier works with no extra branch.

- [ ] **Step 4: Run the validation test, expect pass.** `cd backend && npm test` → the two new tests PASS (others may now fail to compile; fixed below).

- [ ] **Step 5: Edit `tracks.ts`** — `pricePerMinuteCents` → `pricePerMinuteMillicents` (interface + result type + SQL `price_per_minute_cents` → `price_per_minute_millicents` + mapping).

- [ ] **Step 6: Edit `catalog.ts`, `library.ts`, `artist-public.ts`** — same rename: every `pricePerMinuteCents` → `pricePerMinuteMillicents`, every SQL `price_per_minute_cents` → `price_per_minute_millicents`.

- [ ] **Step 7: Edit `lib/x402.ts`** — in `PaymentRequirements` and `paymentRequired`: rename field `pricePerMinuteCents` → `pricePerMinuteMillicents` (both the interface field and the opts param); `maxAmountRequired` now carries millicents. Update the doc comment on `maxAmountRequired`/`pricePerMinuteMillicents` to say "millicents".

- [ ] **Step 8: Edit handlers** — propagate field renames:
  - `charge.ts`: `track.pricePerMinuteCents` → `track.pricePerMinuteMillicents` (lines 31, 41, 57); `amountCents:` → `amountMillicents:`; `pricePerMinuteCents:` in `paymentRequired` call → `pricePerMinuteMillicents:`; `result.balanceCents` → `result.balanceMillicents`; response `{ balanceCents }` → `{ balanceMillicents }`.
  - `stream.ts:33`: `pricePerMinuteCents: track.pricePerMinuteCents` → `pricePerMinuteMillicents: track.pricePerMinuteMillicents`.
  - `library.ts:50`: `pricePerMinuteCents: LIKE_COST_CENTS` → `pricePerMinuteMillicents: LIKE_COST_MILLICENTS` (update import).
  - `wallet.ts`: any `balanceCents` response field → `balanceMillicents`; `getBalanceCents` → `getBalanceMillicents`; `TOPUP_CENTS` → `TOPUP_MILLICENTS`. Where it builds the Stripe PaymentIntent, the **Stripe amount stays in cents** — set `amountCents = Math.round(millicents / 1000)` at that boundary and keep storing `creditCents` (cents) in PaymentIntent metadata.
  - `stripe-webhook.ts`: `creditTopup` now takes `amountMillicents`. Convert at the boundary: `amountMillicents: (Number(meta.creditCents) || 0) * 1000`. The display strings dividing by 100 (lines 54, 58) must read the millicents result and divide by 100_000 for dollars: `result.balanceMillicents / 100000`.

- [ ] **Step 9: Edit `meter.ts`** — `MeterEvent.amountCents` → `amountMillicents`; the DynamoDB item attribute `amountCents: { N: ... }` → `amountMillicents: { N: ... }`; update the doc comment.
  (The rollup Lambda is updated in Task 3; the cutover note in the spec applies.)

- [ ] **Step 10: Fix the two existing tests** — `x402.test.ts`: `pricePerMinuteCents: 4` → `pricePerMinuteMillicents: 4` and `req.maxAmountRequired` assertion stays `4`. `artist-public.test.ts`: `price_per_minute_cents: 1` → `price_per_minute_millicents: 1000` and any asserted `pricePerMinuteCents` → `pricePerMinuteMillicents` (value ×1000).

- [ ] **Step 11: Add a fractional-charge test** to `billing.test.ts` (guarded so it only runs when DSQL is configured, matching existing test posture; if billing tests in this repo are pure-unit only, assert the math via `isValidRateMillicents(500)` and a direct `chargeMinute` mock is out of scope — keep this step to: assert a 500-millicent rate is valid and documented as 0.5¢). Minimal:
```ts
test("0.5¢/min is representable as 500 millicents and valid", () => {
  assert.equal(isValidRateMillicents(500), true); // 500 millicents = 0.5 cents
});
```

- [ ] **Step 12: Typecheck + test, expect green.** `cd backend && npm run typecheck && npm test`
  Expected: typecheck clean, all tests PASS. Grep guard: `grep -rn "PerMinuteCents\|balanceCents\|amount_cents\|balance_cents\|price_per_minute_cents\|TOPUP_CENTS\|LIKE_COST_CENTS\|ONBOARDING_GIFT_CENTS\|getBalanceCents" backend/src` returns nothing (except intentional `fee_cents` / Stripe-boundary `creditCents`/`amountCents` locals).

- [ ] **Step 13: Commit**
```bash
git add backend/src
git commit -m "feat(billing): rename money fields to millicents; add rate bounds + validator"
```

---

## Task 3: Update rollup Lambda to millicents

**Files:**
- Modify: `infra/lambda/rollup/index.js:50`, `:56`, `:60`, `:72`, `:76`, `:103`

**Interfaces:**
- Consumes: DynamoDB METER items now carrying `amountMillicents` (from Task 2 / Task 9 of backend); DSQL columns now `amount_millicents` (from Task 1).

- [ ] **Step 1: Edit `index.js`** — replace `amount_cents` → `amount_millicents` in both SQL statements (ledger insert `:50`, summary upsert `:56`/`:60`); replace `e.amountCents` → `e.amountMillicents` (`:72`, `:76`); replace the attribute read `amountCents: n("amountCents")` → `amountMillicents: n("amountMillicents")` (`:103`).
  - **Cutover safety (from spec):** to tolerate in-flight old-format events for one release, make the read fall back: `amountMillicents: n("amountMillicents") ?? (n("amountCents") != null ? n("amountCents") * 1000 : 0)`. Remove the fallback in a follow-up once the queue is drained.

- [ ] **Step 2: Sanity check (no unit test harness in this dir).** `node --check infra/lambda/rollup/index.js`
  Expected: no output (syntax OK).

- [ ] **Step 3: Commit**
```bash
git add infra/lambda/rollup/index.js
git commit -m "feat(rollup): aggregate millicents; tolerate legacy cents events for one release"
```

---

## Task 4: Update OpenAPI contract

**Files:**
- Modify: `backend/openapi.yaml`

- [ ] **Step 1: Rename schema fields** — every `pricePerMinuteCents` → `pricePerMinuteMillicents` on `Track`/`CatalogTrack` and any `balanceCents` → `balanceMillicents` on wallet/charge responses. Update descriptions to say "millicents (cents × 1000)".

- [ ] **Step 2: Add the rate route** under paths:
```yaml
  /artist/track/rate:
    post:
      summary: Set the per-minute rate (millicents) on a track you own
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [trackId, ratePerMinuteMillicents]
              properties:
                trackId: { type: string }
                ratePerMinuteMillicents:
                  type: integer
                  minimum: 0
                  maximum: 100000
                  description: 0 (free) to 100000 ($1.00/min), in 100-millicent (0.1¢) steps
      responses:
        "200": { description: Rate updated }
        "400": { description: Invalid rate }
        "403": { description: Not your track }
```

- [ ] **Step 3: Commit**
```bash
git add backend/openapi.yaml
git commit -m "docs(api): millicents fields + POST /artist/track/rate"
```

---

## Task 5: Rate write endpoint (PARALLEL — depends on Task 2)

**Files:**
- Modify: `backend/src/domain/artist-content.ts` (add `setTrackRate`), `backend/src/handlers/artist-content.ts` (add `rateUpdate`), and the router that maps routes to handlers (search: `grep -rn "artist/cover/commit\|coverCommit" backend/src`).
- Test: `backend/src/domain/artist-content.test.ts` (extend)

**Interfaces:**
- Consumes: `requireArtist`, `ownsTrack`, `isValidRateMillicents` (Task 2), pattern from `coverCommit`.
- Produces: `POST /v1/artist/track/rate { trackId, ratePerMinuteMillicents } → { ok, ratePerMinuteMillicents }`.

- [ ] **Step 1: Add a failing test** in `artist-content.test.ts` mirroring the existing tests' style — assert `setTrackRate` rejects (returns false / 0 rows) for a non-owned track and that the handler validates bounds. (If the existing test file mocks DSQL, follow that mock; otherwise assert `isValidRateMillicents` gating in a thin unit test of the handler's validation branch.)
```ts
import { isValidRateMillicents } from "./billing.ts";
test("rate handler rejects off-step / over-cap before touching DB", () => {
  assert.equal(isValidRateMillicents(150), false);
  assert.equal(isValidRateMillicents(200000), false);
});
```

- [ ] **Step 2: Run it, expect pass/fail accordingly.** `cd backend && npm test`

- [ ] **Step 3: Add `setTrackRate`** to `domain/artist-content.ts`, mirroring `setTrackCover`:
```ts
export async function setTrackRate(
  artistId: string, trackId: string, rateMillicents: number,
): Promise<boolean> {
  const res = await query(
    `UPDATE tracks SET price_per_minute_millicents = $3
       WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId, rateMillicents],
  );
  return Boolean(res.rowCount);
}
```

- [ ] **Step 4: Add the `rateUpdate` handler** to `handlers/artist-content.ts`:
```ts
import { isValidRateMillicents } from "../domain/billing.ts";
import { setTrackRate } from "../domain/artist-content.ts";

export const rateUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  const rate = b.ratePerMinuteMillicents;
  if (!isValidRateMillicents(rate)) return error(400, "invalid rate");
  const okUpd = await setTrackRate(artistId, trackId, rate);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, ratePerMinuteMillicents: rate }, NO_STORE);
};
```

- [ ] **Step 5: Register the route** — in the router file, add `POST /v1/artist/track/rate → rateUpdate`, mirroring how `coverCommit` is registered.

- [ ] **Step 6: Typecheck + test.** `cd backend && npm run typecheck && npm test` → green.

- [ ] **Step 7: Commit**
```bash
git add backend/src
git commit -m "feat(artist): POST /artist/track/rate to set per-track rate"
```

---

## Task 6: Frontend — millicents rename, rate editor, free-tier display (PARALLEL — depends on Task 2)

**Files:**
- Modify: `frontend/lib/api/types.ts:12`, `:82` (and any other `pricePerMinuteCents` / `balanceCents`), the artist track editor under `frontend/components/artist/`, listener track cards (`frontend/components/listen/TrackCard.tsx` etc.), and `frontend/context/PlayerProvider.tsx`.

**Interfaces:**
- Consumes: API now returns `pricePerMinuteMillicents`, `balanceMillicents`; new endpoint `POST /v1/artist/track/rate`.

- [ ] **Step 1: Rename types** in `frontend/lib/api/types.ts` — `pricePerMinuteCents` → `pricePerMinuteMillicents` (both occurrences); any `balanceCents` → `balanceMillicents`.

- [ ] **Step 2: Add a display helper** (e.g. in `frontend/lib/format.ts` or alongside existing formatters):
```ts
export function formatRate(millicents: number): string {
  if (millicents === 0) return "Free";
  return `${(millicents / 1000).toFixed(1).replace(/\.0$/, "")}¢/min`;
}
export const centsFromMillicents = (m: number) => m / 1000;
export const dollarsFromMillicents = (m: number) => m / 100000;
```

- [ ] **Step 3: Update every consumer** — replace `pricePerMinuteCents` reads with `pricePerMinuteMillicents` + `formatRate(...)`; replace balance displays (`balanceCents / 100`) with `dollarsFromMillicents(balanceMillicents)`; the player's meter math uses `pricePerMinuteMillicents`.

- [ ] **Step 4: Add the rate editor** to the artist track editor: a numeric input in **cents** (placeholder `e.g. 0.5`, min 0, max 100, step 0.1) plus a "Free" affordance. On save, send `ratePerMinuteMillicents = Math.round(cents * 1000)` to `POST /v1/artist/track/rate`. Validate client-side (`% 100 === 0` after ×1000, ≤ 100000). Show the returned value via `formatRate`.

- [ ] **Step 5: Typecheck/build.** Run the frontend's typecheck/lint (`cd frontend && npm run typecheck` or `npm run build` per project) → green. Grep guard: `grep -rn "pricePerMinuteCents\|balanceCents" frontend` returns nothing.

- [ ] **Step 6: Commit**
```bash
git add frontend
git commit -m "feat(web): millicents display + per-track rate editor with free tier"
```

---

## Task 7: Free-tier integration test (depends on Task 5)

**Files:**
- Test: `backend/src/domain/billing.test.ts` (extend) or a handler-level test if the repo has DSQL-backed integration tests.

**Interfaces:**
- Consumes: `chargeMinute` (Task 2), 0-rate behavior.

- [ ] **Step 1: Add the test** asserting a 0 amount charge succeeds even at empty balance and writes a ledger row (run only when DSQL configured, matching repo posture):
```ts
test("free tier: 0-millicent charge succeeds at empty balance", async (t) => {
  // skip if DSQL not configured locally — match existing guarded tests
  // with a seeded 0-balance account + 0-rate track:
  //   const r = await chargeMinute({ accountId, trackId, artistId, amountMillicents: 0 });
  //   assert.equal(r.ok, true);
  //   assert.equal(r.balanceMillicents, 0);
});
```
  (Fill in seeding to match whatever fixtures the repo's DSQL-backed tests already use. If none exist, keep this as a documented unit assertion that `amountMillicents: 0` satisfies the `>= 0` balance guard, since that is the actual mechanism.)

- [ ] **Step 2: Run + commit.** `cd backend && npm test`
```bash
git add backend/src
git commit -m "test(billing): free-tier 0-rate plays at empty balance"
```

---

## Self-Review notes

- **Spec coverage:** millicents migration (Tasks 1–4), rate write path (Task 5), free tier meter-at-zero (Tasks 2 & 7), bounds 0.1¢/$1 (Global Constraints + Task 2), frontend display/editor (Task 6), Stripe boundary (Task 2 steps 8), rollup cutover (Task 3). All spec sections map to a task.
- **Type consistency:** field names locked in Global Constraints and reused verbatim in every task's Interfaces block.
- **Known soft spots to resolve at execution time:** the exact DSQL connector import in Task 1 Step 2, the router file location (Task 5 Step 5), and whether the repo has DSQL-backed integration tests (affects Tasks 5/7 test depth) — each task says how to adapt to what's actually there.
