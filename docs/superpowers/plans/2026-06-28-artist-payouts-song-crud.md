# Artist Payouts (Stripe Connect) + Song CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let artists onboard to Stripe Connect Express and withdraw their accrued earnings on demand, and create / edit / soft-delete their own songs (with real audio upload) from the artist dashboard.

**Architecture:** New endpoints follow the existing framework-free handler pattern (`ApiRequest → ApiResponse`, registered in `backend/src/router.ts`). Money math is pure and unit-tested; DSQL access goes through the shared `query`/`withDsql` helpers and is integration-tested behind the `dsqlConfigured()` guard. Audio uploads use S3 presigned PUT (browser → S3 directly), reusing the cover/avatar presign→commit pattern. Payouts use synchronous Stripe Transfers with a reserve-then-transfer ledger row for concurrency safety — no Connect webhooks.

**Tech Stack:** TypeScript ESM (Node `--experimental-strip-types`), `node:test`, `pg` over Aurora DSQL, `stripe` ^22, AWS SDK v3 (S3 presign), Next.js 15 / React 19 frontend with a same-origin `/api/v1` proxy.

## Global Constraints

- **Money is millicents** (cents × 1000) everywhere internally; convert to whole cents only at the Stripe boundary. Helpers in `backend/src/domain/billing.ts`: `stripeCentsToMillicents`, `millicentsToStripeCents` (rounds). For payouts use `Math.floor(millicents/1000)` (floor, never overpay).
- **DSQL caveats:** no foreign keys, no triggers; `ALTER TABLE ... ADD COLUMN` may NOT carry a `NOT NULL`/`DEFAULT` constraint (nullable only, treat NULL as the default in app code); one DDL statement per array entry in `migrate-dsql.mjs`; secondary indexes use `CREATE INDEX ASYNC IF NOT EXISTS`. `CREATE TABLE` *may* carry defaults/NOT NULL.
- **Shared DSQL across worktrees:** one DSQL instance backs every local checkout. Run the migration deliberately, once, against the shared instance. `deploy.mjs` does NOT auto-run migrations. All DDL is `IF NOT EXISTS` so re-runs are safe.
- **Test runner:** `cd backend && npm test` runs `node --experimental-strip-types --test src/**/*.test.ts`. Tests are colocated `*.test.ts`. DSQL-dependent tests gate on `{ skip: !dsqlConfigured() }` and clean up their rows in a `finally`. Use timestamp+random-suffixed synthetic IDs (DSQL has no FKs).
- **Imports use the `.ts` extension** (e.g. `import { query } from "../lib/dsql.ts"`).
- **Handler auth:** `const s = await requireSession(req)` (throws 401) then resolve the artist via the existing `requireArtist(s.sub)` local pattern in `handlers/artist-content.ts` (`artistIdForAccount` → 403 if none).
- **Stripe lives in handlers** (matching `handlers/wallet.ts`); domain modules do DSQL + pure math only. Guard Stripe-backed endpoints with `stripeConfigured()` and return a clear 503/demo response when unset.
- **Commits:** every commit message ends with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Money source of truth for "earned":** `royalty_ledger.amount_millicents` summed per `artist_id` (the same figure the dashboard already shows as earnings). Artists withdraw 100% of their ledger earnings minus prior non-failed payouts. No additional platform cut is applied at withdrawal time.

## Parallelization Map

After **Task 0** lands (migration), two backend streams run in parallel worktrees, then two frontend streams:

| Stream | Tasks | Notes |
|---|---|---|
| **0** | Task 0 | Migration — lands first, everything depends on it |
| **A (payouts backend)** | Tasks 1 → 2 → 3 | Owns `domain/payouts.ts`, `handlers/payouts.ts` |
| **B (song-crud backend)** | Tasks 4 → 5 → 6 → 7 | Owns `domain/tracks-crud.ts`, extends `handlers/artist-content.ts`, `domain/catalog.ts` |
| **C (payouts frontend)** | Tasks 8 (payout parts) → 9 | Owns `components/artist/PayoutsCard.tsx` |
| **D (song-crud frontend)** | Tasks 8 (song parts) → 10 | Owns `components/artist/SongManager.tsx` |
| **wiring** | Task 11 | Single sequential pass: `router.ts` (if not already), `artist/page.tsx` |

`router.ts` is touched by Tasks 3 and 6. When run sequentially (subagent-driven), no conflict. If A and B run in true parallel worktrees, leave route registration to Task 11 and have Tasks 3/6 only export handlers.

---

## Task 0: DSQL migration — `is_active` + `payout_transfers`

**Files:**
- Modify: `infra/scripts/migrate-dsql.mjs` (append statements to the `STATEMENTS` array, before the projector block)

**Interfaces:**
- Produces: `tracks.is_active` (nullable boolean, NULL ⇒ active); `payout_transfers` table `{ id uuid PK, artist_id uuid, amount_millicents bigint, stripe_transfer_id text, status text, created_at timestamptz }`; index `payout_transfers_by_artist`.

- [ ] **Step 1: Add the statements**

In `infra/scripts/migrate-dsql.mjs`, inside the `STATEMENTS` array, after the `tracks` table + `tracks_by_artist` index entries, add:

```js
  // Soft-delete flag for artist-managed tracks. DSQL rejects ADD COLUMN with a
  // default, so this is nullable; the app treats NULL as active (COALESCE).
  `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_active BOOLEAN`,
  // Withdrawal ledger — one row per payout attempt. status: 'pending' (reserved,
  // transfer in flight) | 'paid' (Stripe transfer succeeded) | 'failed' (released).
  // available = SUM(royalty_ledger) - SUM(payout_transfers WHERE status <> 'failed').
  `CREATE TABLE IF NOT EXISTS payout_transfers (
     id                 UUID PRIMARY KEY,
     artist_id          UUID NOT NULL,
     amount_millicents  BIGINT NOT NULL,
     stripe_transfer_id TEXT,
     status             TEXT NOT NULL DEFAULT 'pending',
     created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS payout_transfers_by_artist ON payout_transfers (artist_id)`,
```

- [ ] **Step 2: Apply against the shared DSQL instance**

Run (requires `TOLLROAD_DSQL_ENDPOINT` + AWS creds with DSQL connect-admin):

```bash
cd infra && TOLLROAD_DSQL_ENDPOINT="$TOLLROAD_DSQL_ENDPOINT" node scripts/migrate-dsql.mjs
```

Expected: `ok: ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_active ...`, `ok: CREATE TABLE IF NOT EXISTS payout_transfers ...`, `ok: CREATE INDEX ASYNC ... payout_transfers_by_artist`, ending `DSQL schema applied.` Re-running is a safe no-op.

If `TOLLROAD_DSQL_ENDPOINT` is not available in this environment, mark this step blocked and note it — the integration tests in later tasks will skip cleanly, but the feature cannot run end-to-end until the migration is applied.

- [ ] **Step 3: Commit**

```bash
git add infra/scripts/migrate-dsql.mjs
git commit -m "feat(db): add tracks.is_active + payout_transfers table"
```

---

## Task 1: Payout money math (pure functions)

**Files:**
- Create: `backend/src/domain/payouts.ts`
- Test: `backend/src/domain/payouts.test.ts`

**Interfaces:**
- Produces: `payableCents(availableMillicents: number): number` — floor to whole cents, never negative. Consumed by Task 2 (`reserveWithdrawal`) and Task 3 (handler).

- [ ] **Step 1: Write the failing test**

Create `backend/src/domain/payouts.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { payableCents } from "./payouts.ts";

test("payableCents floors millicents to whole cents", () => {
  assert.equal(payableCents(1_000_000), 1000); // $10.00 → 1000¢
  assert.equal(payableCents(1500), 1);          // 1.5¢ → 1¢ (floor, not round)
  assert.equal(payableCents(1499), 1);          // 1.499¢ → 1¢
  assert.equal(payableCents(999), 0);           // 0.999¢ → 0¢
});

test("payableCents is never negative", () => {
  assert.equal(payableCents(0), 0);
  assert.equal(payableCents(-5000), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --experimental-strip-types --test src/domain/payouts.test.ts`
Expected: FAIL — cannot find module `./payouts.ts` (or `payableCents` is not a function).

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/domain/payouts.ts`:

```ts
// Artist payouts — Stripe Connect Express. Pure money math here; DSQL ledger ops
// (reserve/mark) added in the next task. Earnings come from royalty_ledger; the
// payout_transfers table records withdrawals. available = earned − non-failed payouts.

/** Whole cents payable for a given available balance, floored so we never
 *  transfer more than the artist has earned. The sub-cent remainder stays in the
 *  artist's available balance for next time. */
export function payableCents(availableMillicents: number): number {
  if (availableMillicents <= 0) return 0;
  return Math.floor(availableMillicents / 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --experimental-strip-types --test src/domain/payouts.test.ts`
Expected: PASS (4 assertions across 2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/payouts.ts backend/src/domain/payouts.test.ts
git commit -m "feat(payouts): payableCents floor-to-cents money math"
```

---

## Task 2: Payout DSQL ledger ops (reserve / mark / read)

**Files:**
- Modify: `backend/src/domain/payouts.ts`
- Test: `backend/src/domain/payouts.test.ts` (add DSQL-guarded integration tests)

**Interfaces:**
- Consumes: `payableCents` (Task 1); `query`, `withDsql` from `../lib/dsql.ts`.
- Produces:
  - `getEarnedMillicents(artistId: string): Promise<number>`
  - `getAvailableMillicents(artistId: string): Promise<number>` — earned − non-failed payouts
  - `reserveWithdrawal(artistId: string): Promise<{ ok: true; payoutId: string; payableCents: number } | { ok: false; reason: "empty" }>` — atomic reserve in one txn
  - `markWithdrawalPaid(payoutId: string, transferId: string): Promise<void>`
  - `markWithdrawalFailed(payoutId: string): Promise<void>`
  - `getArtistPayoutInfo(artistId: string): Promise<{ stripeAccountId: string | null; payoutsEnabled: boolean }>`
  - `setConnectAccount(artistId: string, acctId: string): Promise<void>`
  - `setPayoutsEnabled(artistId: string, enabled: boolean): Promise<void>`
  - `listPayouts(artistId: string): Promise<PayoutRow[]>` where `PayoutRow = { id: string; amountMillicents: number; status: string; createdAt: string }`

- [ ] **Step 1: Write the failing integration test**

Add to `backend/src/domain/payouts.test.ts`:

```ts
import { dsqlConfigured, query } from "../lib/dsql.ts";
import {
  getEarnedMillicents,
  getAvailableMillicents,
  reserveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
} from "./payouts.ts";

test(
  "reserveWithdrawal reserves earned balance once; second reserve sees it gone",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `00000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const userId = artistId; // synthetic; DSQL has no FKs
    const trackId = artistId;
    const minuteEpoch = Math.floor(Date.now() / 1000 / 60);
    const ledgerKey = `payout-test-${suffix}`;

    // Seed: one ledger row worth $5.00 (500_000 millicents) for this artist.
    await query(
      `INSERT INTO royalty_ledger
         (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_millicents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ledgerKey, userId, trackId, artistId, minuteEpoch, 500_000],
    );

    try {
      assert.equal(await getEarnedMillicents(artistId), 500_000);
      assert.equal(await getAvailableMillicents(artistId), 500_000);

      const first = await reserveWithdrawal(artistId);
      assert.ok(first.ok, "first reserve should succeed");
      if (first.ok) {
        assert.equal(first.payableCents, 500); // $5.00
        // Reserved (status 'pending') so available is now 0.
        assert.equal(await getAvailableMillicents(artistId), 0);

        const second = await reserveWithdrawal(artistId);
        assert.equal(second.ok, false); // nothing left to withdraw

        // Mark the reservation paid, then verify it stays counted.
        await markWithdrawalPaid(first.payoutId, "tr_test_123");
        assert.equal(await getAvailableMillicents(artistId), 0);
      }
    } finally {
      await query(`DELETE FROM payout_transfers WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM royalty_ledger WHERE idempotency_key = $1`, [ledgerKey]).catch(() => {});
    }
  },
);

test(
  "markWithdrawalFailed releases the reservation back to available",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `10000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const ledgerKey = `payout-test-fail-${suffix}`;
    const minuteEpoch = Math.floor(Date.now() / 1000 / 60);
    await query(
      `INSERT INTO royalty_ledger
         (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_millicents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ledgerKey, artistId, artistId, artistId, minuteEpoch, 300_000],
    );
    try {
      const r = await reserveWithdrawal(artistId);
      assert.ok(r.ok);
      if (r.ok) {
        assert.equal(await getAvailableMillicents(artistId), 0);
        await markWithdrawalFailed(r.payoutId);
        assert.equal(await getAvailableMillicents(artistId), 300_000); // released
      }
    } finally {
      await query(`DELETE FROM payout_transfers WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM royalty_ledger WHERE idempotency_key = $1`, [ledgerKey]).catch(() => {});
    }
  },
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --experimental-strip-types --test src/domain/payouts.test.ts`
Expected: If `TOLLROAD_DSQL_ENDPOINT` is set → FAIL (functions not exported). If unset → the two new tests report as **skipped** (this is acceptable; rely on the pure test + manual verification). Confirm the failure/skip is for the right reason before implementing.

- [ ] **Step 3: Write the implementation**

Append to `backend/src/domain/payouts.ts`:

```ts
import { randomUUID } from "node:crypto";
import { query, withDsql } from "../lib/dsql.ts";

export interface PayoutRow {
  id: string;
  amountMillicents: number;
  status: string;
  createdAt: string;
}

const SERIALIZATION_FAILURE = "40001";
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if ((err as { code?: string })?.code === SERIALIZATION_FAILURE) continue;
      throw err;
    }
  }
  throw lastErr;
}

export async function getEarnedMillicents(artistId: string): Promise<number> {
  const r = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_millicents), 0) AS total
       FROM royalty_ledger WHERE artist_id = $1`,
    [artistId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function reservedMillicents(artistId: string): Promise<number> {
  const r = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_millicents), 0) AS total
       FROM payout_transfers WHERE artist_id = $1 AND status <> 'failed'`,
    [artistId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

export async function getAvailableMillicents(artistId: string): Promise<number> {
  const [earned, reserved] = [await getEarnedMillicents(artistId), await reservedMillicents(artistId)];
  return Math.max(0, earned - reserved);
}

/** Atomically reserve the full available balance as a 'pending' payout row, so
 *  concurrent withdraws can't both pass the balance check. The transfer happens
 *  AFTER this commits (in the handler); markWithdrawalPaid/Failed finalize it. */
export async function reserveWithdrawal(
  artistId: string,
): Promise<{ ok: true; payoutId: string; payableCents: number } | { ok: false; reason: "empty" }> {
  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");
        const earnedR = await db.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_millicents),0) AS total FROM royalty_ledger WHERE artist_id = $1`,
          [artistId],
        );
        const reservedR = await db.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_millicents),0) AS total
             FROM payout_transfers WHERE artist_id = $1 AND status <> 'failed'`,
          [artistId],
        );
        const available = Number(earnedR.rows[0]!.total) - Number(reservedR.rows[0]!.total);
        const cents = available > 0 ? Math.floor(available / 1000) : 0;
        if (cents <= 0) {
          await db.query("ROLLBACK");
          return { ok: false, reason: "empty" as const };
        }
        const id = randomUUID();
        await db.query(
          `INSERT INTO payout_transfers (id, artist_id, amount_millicents, status)
             VALUES ($1, $2, $3, 'pending')`,
          [id, artistId, cents * 1000],
        );
        await db.query("COMMIT");
        return { ok: true as const, payoutId: id, payableCents: cents };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

export async function markWithdrawalPaid(payoutId: string, transferId: string): Promise<void> {
  await query(
    `UPDATE payout_transfers SET status = 'paid', stripe_transfer_id = $2 WHERE id = $1`,
    [payoutId, transferId],
  );
}

export async function markWithdrawalFailed(payoutId: string): Promise<void> {
  await query(`UPDATE payout_transfers SET status = 'failed' WHERE id = $1`, [payoutId]);
}

export async function getArtistPayoutInfo(
  artistId: string,
): Promise<{ stripeAccountId: string | null; payoutsEnabled: boolean }> {
  const r = await query<{ stripe_account_id: string | null; payouts_enabled: boolean | null }>(
    `SELECT stripe_account_id, payouts_enabled FROM artists WHERE id = $1`,
    [artistId],
  );
  return {
    stripeAccountId: r.rows[0]?.stripe_account_id ?? null,
    payoutsEnabled: Boolean(r.rows[0]?.payouts_enabled),
  };
}

export async function setConnectAccount(artistId: string, acctId: string): Promise<void> {
  await query(`UPDATE artists SET stripe_account_id = $2 WHERE id = $1`, [artistId, acctId]);
}

export async function setPayoutsEnabled(artistId: string, enabled: boolean): Promise<void> {
  await query(`UPDATE artists SET payouts_enabled = $2 WHERE id = $1`, [artistId, enabled]);
}

export async function listPayouts(artistId: string): Promise<PayoutRow[]> {
  const r = await query<{ id: string; amount_millicents: string; status: string; created_at: string }>(
    `SELECT id, amount_millicents, status, created_at
       FROM payout_transfers WHERE artist_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [artistId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    amountMillicents: Number(row.amount_millicents),
    status: row.status,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && node --experimental-strip-types --test src/domain/payouts.test.ts`
Expected: pure test PASS; DSQL tests PASS if `TOLLROAD_DSQL_ENDPOINT` set, else skipped. Also run `npm run typecheck` and expect no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/payouts.ts backend/src/domain/payouts.test.ts
git commit -m "feat(payouts): DSQL reserve/mark/read ledger ops"
```

---

## Task 3: Payout handlers + routes

**Files:**
- Create: `backend/src/handlers/payouts.ts`
- Modify: `backend/src/router.ts` (register 3 routes)

**Interfaces:**
- Consumes: everything from `domain/payouts.ts` (Task 2); `stripe`, `stripeConfigured` from `../domain/stripe.ts`; `requireSession`, `ok`, `error`, `NO_STORE`, `HttpError` from `../lib/http.ts`; `artistIdForAccount` from `../domain/artist-content.ts`; `dsqlConfigured` from `../lib/dsql.ts`.
- Produces handlers: `onboard`, `status`, `withdraw`. Routes:
  - `POST /artist/payouts/onboard`
  - `GET  /artist/payouts/status`
  - `POST /artist/payouts/withdraw`

- [ ] **Step 1: Write the handler**

Create `backend/src/handlers/payouts.ts`:

```ts
import { type Handler, ok, error, requireSession, NO_STORE, HttpError } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { stripe, stripeConfigured } from "../domain/stripe.ts";
import { artistIdForAccount } from "../domain/artist-content.ts";
import {
  payableCents,
  getAvailableMillicents,
  getArtistPayoutInfo,
  setConnectAccount,
  setPayoutsEnabled,
  reserveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
  listPayouts,
} from "../domain/payouts.ts";

async function requireArtist(accountId: string): Promise<string> {
  const id = await artistIdForAccount(accountId);
  if (!id) throw new HttpError(403, "not an artist");
  return id;
}

// Where Stripe returns the artist after hosted onboarding. The dashboard reads
// ?payouts=return and re-fetches status.
function appBase(): string {
  return (process.env.TOLLROAD_APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** POST /artist/payouts/onboard — create the Express account if needed, return a
 *  Stripe-hosted onboarding link. */
export const onboard: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  if (!stripeConfigured()) return error(503, "payouts not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  let { stripeAccountId } = await getArtistPayoutInfo(artistId);
  if (!stripeAccountId) {
    const acct = await stripe().accounts.create({
      type: "express",
      capabilities: { transfers: { requested: true } },
      metadata: { artistId },
    });
    stripeAccountId = acct.id;
    await setConnectAccount(artistId, stripeAccountId);
  }

  const link = await stripe().accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appBase()}/artist?payouts=refresh`,
    return_url: `${appBase()}/artist?payouts=return`,
    type: "account_onboarding",
  });
  return ok({ url: link.url }, NO_STORE);
};

/** GET /artist/payouts/status — refresh payouts_enabled from Stripe, return the
 *  dashboard payout state. */
export const status: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  const info = await getArtistPayoutInfo(artistId);
  let payoutsEnabled = info.payoutsEnabled;

  if (info.stripeAccountId && stripeConfigured()) {
    const acct = await stripe().accounts.retrieve(info.stripeAccountId);
    payoutsEnabled = Boolean(acct.payouts_enabled && acct.details_submitted);
    if (payoutsEnabled !== info.payoutsEnabled) await setPayoutsEnabled(artistId, payoutsEnabled);
  }

  const [availableMillicents, history] = [
    await getAvailableMillicents(artistId),
    await listPayouts(artistId),
  ];
  return ok(
    { connected: Boolean(info.stripeAccountId), payoutsEnabled, availableMillicents, history },
    NO_STORE,
  );
};

/** POST /artist/payouts/withdraw — reserve, transfer, finalize. Concurrency-safe
 *  via the reserve-then-transfer ledger row. */
export const withdraw: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  if (!stripeConfigured()) return error(503, "payouts not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  const info = await getArtistPayoutInfo(artistId);
  if (!info.stripeAccountId || !info.payoutsEnabled) {
    return error(400, "complete payout setup first");
  }

  const reserved = await reserveWithdrawal(artistId);
  if (!reserved.ok) return error(400, "nothing to withdraw");

  try {
    const transfer = await stripe().transfers.create(
      {
        amount: reserved.payableCents,
        currency: "usd",
        destination: info.stripeAccountId,
        metadata: { artistId, payoutId: reserved.payoutId },
      },
      { idempotencyKey: `payout:${reserved.payoutId}` },
    );
    await markWithdrawalPaid(reserved.payoutId, transfer.id);
  } catch (err) {
    await markWithdrawalFailed(reserved.payoutId);
    console.error("withdraw: stripe transfer failed", err);
    return error(502, "transfer failed — no funds were moved");
  }

  const availableMillicents = await getAvailableMillicents(artistId);
  return ok(
    { transferId: reserved.payoutId, paidMillicents: reserved.payableCents * 1000, availableMillicents },
    NO_STORE,
  );
};
```

- [ ] **Step 2: Register routes in `router.ts`**

Add the import near the other handler imports:

```ts
import * as payouts from "./handlers/payouts.ts";
```

Add to the `ROUTES` array, after the `compile("POST", "/artist/profile", artistContent.profileUpdate),` line:

```ts
  compile("POST", "/artist/payouts/onboard", payouts.onboard),
  compile("GET", "/artist/payouts/status", payouts.status),
  compile("POST", "/artist/payouts/withdraw", payouts.withdraw),
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors. (Note: `stripe().accounts.retrieve` returns `Stripe.Account`; `payouts_enabled`/`details_submitted` are typed booleans/optional — the `Boolean(...)` wrap handles undefined.)

- [ ] **Step 4: Manual smoke (if Stripe test keys + DSQL available)**

With the local dev server running (`cd backend && npm run dev`) and a signed-in artist session cookie, exercise:
```bash
# status for a fresh artist
curl -s localhost:8787/v1/artist/payouts/status -H "authorization: Bearer $JWT" | jq
# → { connected:false, payoutsEnabled:false, availableMillicents:<earned>, history:[] }
```
Document the observed JSON. If keys aren't available, note that and rely on the unit/integration tests from Tasks 1–2.

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/payouts.ts backend/src/router.ts
git commit -m "feat(payouts): onboard/status/withdraw endpoints"
```

---

## Task 4: Song-CRUD validation (pure functions)

**Files:**
- Create: `backend/src/domain/tracks-crud.ts`
- Test: `backend/src/domain/tracks-crud.test.ts`

**Interfaces:**
- Produces:
  - `isValidTitle(v: unknown): boolean` — non-empty trimmed string, ≤ 200 chars
  - `isValidDuration(v: unknown): boolean` — integer 1 … 36000 (10h cap)
  - `extForAudioContentType(ct: string): string | null` — mp3/m4a/wav/flac/aac
  - `buildAudioKey(trackId: string, ext: string, rand: string): string` — `audio/<trackId>-<rand>.<ext>`

- [ ] **Step 1: Write the failing test**

Create `backend/src/domain/tracks-crud.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTitle,
  isValidDuration,
  extForAudioContentType,
  buildAudioKey,
} from "./tracks-crud.ts";

test("isValidTitle accepts non-empty short strings, rejects empty/long/non-string", () => {
  assert.equal(isValidTitle("Midnight Drive"), true);
  assert.equal(isValidTitle("  "), false);
  assert.equal(isValidTitle(""), false);
  assert.equal(isValidTitle("x".repeat(201)), false);
  assert.equal(isValidTitle(123), false);
});

test("isValidDuration accepts 1..36000 integers only", () => {
  assert.equal(isValidDuration(1), true);
  assert.equal(isValidDuration(210), true);
  assert.equal(isValidDuration(36000), true);
  assert.equal(isValidDuration(0), false);
  assert.equal(isValidDuration(36001), false);
  assert.equal(isValidDuration(12.5), false);
  assert.equal(isValidDuration("210"), false);
});

test("extForAudioContentType maps supported audio types only", () => {
  assert.equal(extForAudioContentType("audio/mpeg"), "mp3");
  assert.equal(extForAudioContentType("audio/mp4"), "m4a");
  assert.equal(extForAudioContentType("audio/wav"), "wav");
  assert.equal(extForAudioContentType("audio/flac"), "flac");
  assert.equal(extForAudioContentType("audio/aac"), "aac");
  assert.equal(extForAudioContentType("image/png"), null);
});

test("buildAudioKey is audio-prefixed and deterministic in shape", () => {
  assert.equal(buildAudioKey("t1", "mp3", "abcd"), "audio/t1-abcd.mp3");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --experimental-strip-types --test src/domain/tracks-crud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/domain/tracks-crud.ts`:

```ts
// Artist-managed song CRUD — pure validation + audio-key helpers here; DSQL ops
// and S3 presign added in the next task.

export function isValidTitle(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= 200;
}

// 1 second … 10 hours. Guards against absurd/negative durations in the meter.
export function isValidDuration(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 36000;
}

const AUDIO_CT_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
};
export function extForAudioContentType(ct: string): string | null {
  return AUDIO_CT_EXT[ct] ?? null;
}

export function buildAudioKey(trackId: string, ext: string, rand: string): string {
  return `audio/${trackId}-${rand}.${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --experimental-strip-types --test src/domain/tracks-crud.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/tracks-crud.ts backend/src/domain/tracks-crud.test.ts
git commit -m "feat(tracks): song-crud validation + audio-key helpers"
```

---

## Task 5: Song-CRUD DSQL ops + audio presign

**Files:**
- Modify: `backend/src/domain/tracks-crud.ts`
- Test: `backend/src/domain/tracks-crud.test.ts` (add DSQL-guarded tests)

**Interfaces:**
- Consumes: `query` from `../lib/dsql.ts`; `S3Client`, `PutObjectCommand`, `getSignedUrl` (AWS SDK); `randomUUID`.
- Produces:
  - `audioConfigured(): boolean`
  - `presignAudioPut(key: string, contentType: string): Promise<string>`
  - `createTrack(input: { artistId: string; title: string; durationSeconds: number; pricePerMinuteMillicents: number }): Promise<{ id: string }>` — inserts with `audio_key = ''` (placeholder until committed), `is_active` left NULL (active)
  - `setTrackAudio(artistId: string, trackId: string, key: string): Promise<boolean>`
  - `updateTrack(artistId: string, trackId: string, fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number }): Promise<boolean>`
  - `softDeleteTrack(artistId: string, trackId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing integration test**

Add to `backend/src/domain/tracks-crud.test.ts`:

```ts
import { dsqlConfigured, query } from "../lib/dsql.ts";
import {
  createTrack,
  setTrackAudio,
  updateTrack,
  softDeleteTrack,
} from "./tracks-crud.ts";

test(
  "createTrack → setTrackAudio → updateTrack → softDeleteTrack lifecycle",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `20000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    let trackId = "";
    try {
      const created = await createTrack({
        artistId,
        title: "Test Song",
        durationSeconds: 200,
        pricePerMinuteMillicents: 1000,
      });
      trackId = created.id;
      const row1 = await query<{ audio_key: string; is_active: boolean | null; title: string }>(
        `SELECT audio_key, is_active, title FROM tracks WHERE id = $1`,
        [trackId],
      );
      assert.equal(row1.rows[0]!.audio_key, ""); // placeholder until committed
      assert.equal(row1.rows[0]!.is_active, null); // NULL ⇒ active
      assert.equal(row1.rows[0]!.title, "Test Song");

      assert.equal(await setTrackAudio(artistId, trackId, "audio/x.mp3"), true);
      // Wrong artist cannot set audio.
      assert.equal(await setTrackAudio("99999999-0000-4000-8000-999999999999", trackId, "audio/y.mp3"), false);

      assert.equal(await updateTrack(artistId, trackId, { title: "Renamed", pricePerMinuteMillicents: 2000 }), true);
      const row2 = await query<{ title: string; price_per_minute_millicents: number; audio_key: string }>(
        `SELECT title, price_per_minute_millicents, audio_key FROM tracks WHERE id = $1`,
        [trackId],
      );
      assert.equal(row2.rows[0]!.title, "Renamed");
      assert.equal(row2.rows[0]!.price_per_minute_millicents, 2000);
      assert.equal(row2.rows[0]!.audio_key, "audio/x.mp3"); // unchanged by update

      assert.equal(await softDeleteTrack(artistId, trackId), true);
      const row3 = await query<{ is_active: boolean }>(`SELECT is_active FROM tracks WHERE id = $1`, [trackId]);
      assert.equal(row3.rows[0]!.is_active, false);
    } finally {
      if (trackId) await query(`DELETE FROM tracks WHERE id = $1`, [trackId]).catch(() => {});
    }
  },
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --experimental-strip-types --test src/domain/tracks-crud.test.ts`
Expected: FAIL if DSQL configured (functions not exported); skipped if not. Confirm reason.

- [ ] **Step 3: Write the implementation**

Append to `backend/src/domain/tracks-crud.ts`:

```ts
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query } from "../lib/dsql.ts";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
// Audio uploads go to the bucket fronted by the streaming CloudFront distribution.
// Falls back to the images bucket for a single-bucket local demo.
const AUDIO_BUCKET = process.env.TOLLROAD_AUDIO_BUCKET ?? process.env.TOLLROAD_IMAGES_BUCKET;

export function audioConfigured(): boolean {
  return Boolean(AUDIO_BUCKET);
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}
export async function presignAudioPut(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: AUDIO_BUCKET!, Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: 600 });
}

export async function createTrack(input: {
  artistId: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
}): Promise<{ id: string }> {
  const id = randomUUID();
  // audio_key is NOT NULL in the schema; insert a '' placeholder until the upload
  // is committed. The catalog hides tracks with an empty audio_key.
  await query(
    `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key)
       VALUES ($1, $2, $3, $4, $5, '')`,
    [id, input.artistId, input.title.trim(), input.durationSeconds, input.pricePerMinuteMillicents],
  );
  return { id };
}

export async function setTrackAudio(artistId: string, trackId: string, key: string): Promise<boolean> {
  const r = await query(
    `UPDATE tracks SET audio_key = $3 WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId, key],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function updateTrack(
  artistId: string,
  trackId: string,
  fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number },
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.title !== undefined) { sets.push(`title = $${sets.length + 1}`); vals.push(fields.title.trim()); }
  if (fields.durationSeconds !== undefined) { sets.push(`duration_seconds = $${sets.length + 1}`); vals.push(fields.durationSeconds); }
  if (fields.pricePerMinuteMillicents !== undefined) { sets.push(`price_per_minute_millicents = $${sets.length + 1}`); vals.push(fields.pricePerMinuteMillicents); }
  if (!sets.length) return false;
  vals.push(trackId, artistId);
  const r = await query(
    `UPDATE tracks SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND artist_id = $${vals.length}`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function softDeleteTrack(artistId: string, trackId: string): Promise<boolean> {
  const r = await query(
    `UPDATE tracks SET is_active = false WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId],
  );
  return (r.rowCount ?? 0) > 0;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd backend && node --experimental-strip-types --test src/domain/tracks-crud.test.ts && npm run typecheck`
Expected: pure tests PASS; DSQL test PASS (or skip); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/tracks-crud.ts backend/src/domain/tracks-crud.test.ts
git commit -m "feat(tracks): DSQL create/update/soft-delete + audio presign"
```

---

## Task 6: Song-CRUD handlers + routes

**Files:**
- Modify: `backend/src/handlers/artist-content.ts` (add handlers)
- Modify: `backend/src/router.ts` (register 5 routes)

**Interfaces:**
- Consumes: Task 5 domain fns; existing `requireSession`, `requireArtist`, `ownsTrack`, `isValidRateMillicents`, `rand()` already in/near `artist-content.ts`.
- Produces handlers: `trackCreate`, `audioPresign`, `audioCommit`, `trackUpdate`, `trackDelete`. Routes:
  - `POST /artist/tracks`
  - `POST /artist/audio/presign`
  - `POST /artist/audio/commit`
  - `PUT /artist/tracks/{id}`
  - `DELETE /artist/tracks/{id}`

- [ ] **Step 1: Add imports + handlers to `artist-content.ts`**

Add to the import block from `../domain/tracks-crud.ts`:

```ts
import {
  isValidTitle,
  isValidDuration,
  extForAudioContentType,
  buildAudioKey,
  audioConfigured,
  presignAudioPut,
  createTrack,
  setTrackAudio,
  updateTrack,
  softDeleteTrack,
} from "../domain/tracks-crud.ts";
```

(`ownsTrack`, `rand`, `requireArtist`, `isValidRateMillicents`, `dsqlConfigured`, `ok`, `error`, `NO_STORE`, `requireSession` are all already imported/defined in this file from the existing avatar/cover/rate handlers — reuse them, do not re-import.)

Append these handlers at the end of `backend/src/handlers/artist-content.ts`:

```ts
const DEFAULT_RATE_MILLICENTS = 1000; // 1¢/min, matches the schema default

export const trackCreate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  if (!isValidTitle(b.title)) return error(400, "title required (1–200 chars)");
  if (!isValidDuration(b.durationSeconds)) return error(400, "durationSeconds must be 1–36000");
  const rate = b.pricePerMinuteMillicents ?? DEFAULT_RATE_MILLICENTS;
  if (!isValidRateMillicents(rate)) return error(400, "invalid rate");
  const { id } = await createTrack({
    artistId,
    title: String(b.title),
    durationSeconds: b.durationSeconds,
    pricePerMinuteMillicents: rate,
  });
  return ok({ id }, NO_STORE);
};

export const audioPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !audioConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!(await ownsTrack(artistId, trackId))) return error(403, "not your track");
  const ct = String(b.contentType ?? "");
  const ext = extForAudioContentType(ct);
  if (!ext) return error(400, "unsupported audio type");
  const key = buildAudioKey(trackId, ext, rand());
  const uploadUrl = await presignAudioPut(key, ct);
  return ok({ uploadUrl, key }, NO_STORE);
};

export const audioCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  const key = String(b.key ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!key.startsWith(`audio/${trackId}-`)) return error(403, "bad key");
  const okUpd = await setTrackAudio(artistId, trackId, key);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, audioKey: key }, NO_STORE);
};

export const trackUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const trackId = String(req.params.id ?? "");
  if (!trackId) return error(400, "track id required");
  const b = (req.body ?? {}) as any;
  const fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number } = {};
  if (b.title !== undefined) {
    if (!isValidTitle(b.title)) return error(400, "invalid title");
    fields.title = String(b.title);
  }
  if (b.durationSeconds !== undefined) {
    if (!isValidDuration(b.durationSeconds)) return error(400, "invalid durationSeconds");
    fields.durationSeconds = b.durationSeconds;
  }
  if (b.pricePerMinuteMillicents !== undefined) {
    if (!isValidRateMillicents(b.pricePerMinuteMillicents)) return error(400, "invalid rate");
    fields.pricePerMinuteMillicents = b.pricePerMinuteMillicents;
  }
  if (!Object.keys(fields).length) return error(400, "no fields to update");
  const okUpd = await updateTrack(artistId, trackId, fields);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, ...fields }, NO_STORE);
};

export const trackDelete: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const trackId = String(req.params.id ?? "");
  if (!trackId) return error(400, "track id required");
  const okDel = await softDeleteTrack(artistId, trackId);
  if (!okDel) return error(403, "not your track");
  return ok({ ok: true, deleted: true }, NO_STORE);
};
```

- [ ] **Step 2: Register routes in `router.ts`**

After the payout routes (or the `/artist/profile` route if Task 3 ran in a separate worktree), add:

```ts
  compile("POST", "/artist/tracks", artistContent.trackCreate),
  compile("POST", "/artist/audio/presign", artistContent.audioPresign),
  compile("POST", "/artist/audio/commit", artistContent.audioCommit),
  compile("PUT", "/artist/tracks/{id}", artistContent.trackUpdate),
  compile("DELETE", "/artist/tracks/{id}", artistContent.trackDelete),
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual smoke (if DSQL available)**

With dev server + artist session:
```bash
curl -s -X POST localhost:8787/v1/artist/tracks -H "authorization: Bearer $JWT" \
  -H 'content-type: application/json' -d '{"title":"Smoke","durationSeconds":120}' | jq
# → { id: "<uuid>" }
```
Record the result. If unavailable, rely on Task 4/5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/artist-content.ts backend/src/router.ts
git commit -m "feat(tracks): create/audio-upload/update/delete endpoints"
```

---

## Task 7: Catalog `is_active` filtering + artist summary flag

**Files:**
- Modify: `backend/src/domain/catalog.ts`
- Test: `backend/src/domain/catalog.test.ts` (create, DSQL-guarded)

**Interfaces:**
- Produces: public catalog hides inactive / not-yet-uploaded tracks; `ArtistTrack` gains `isActive: boolean`; `getArtistSummary` returns the artist's own tracks including inactive ones, flagged.

- [ ] **Step 1: Modify `TRACKS_SQL`**

In `backend/src/domain/catalog.ts`, change the `TRACKS_SQL` constant's `FROM`/`JOIN` to add a `WHERE` clause:

```ts
const TRACKS_SQL = `
  SELECT t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
         t.duration_seconds, t.price_per_minute_millicents, t.cover_image_key
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  WHERE COALESCE(t.is_active, true) AND t.audio_key <> ''
  ORDER BY a.name, t.title`;
```

- [ ] **Step 2: Add `isActive` to `ArtistTrack` and its query**

Change the `ArtistTrack` type:

```ts
export type ArtistTrack = {
  id: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
  coverImageKey: string | null;
  isActive: boolean;
};
```

In `getArtistSummary`, change the tracks query + row typing + mapping to include `is_active`:

```ts
    const tracksR = await db.query<{
      id: string;
      title: string;
      duration_seconds: number;
      price_per_minute_millicents: number;
      cover_image_key: string | null;
      is_active: boolean | null;
    }>(
      `SELECT id, title, duration_seconds, price_per_minute_millicents, cover_image_key,
              COALESCE(is_active, true) AS is_active
         FROM tracks WHERE artist_id = $1 ORDER BY title`,
      [artistId],
    );
    const tracks: ArtistTrack[] = tracksR.rows.map((r) => ({
      id: r.id,
      title: r.title,
      durationSeconds: r.duration_seconds,
      pricePerMinuteMillicents: r.price_per_minute_millicents,
      coverImageKey: r.cover_image_key,
      isActive: Boolean(r.is_active),
    }));
```

- [ ] **Step 3: Write a DSQL-guarded test**

Create `backend/src/domain/catalog.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dsqlConfigured, query } from "../lib/dsql.ts";
import { getCatalog } from "./catalog.ts";

test(
  "getCatalog hides soft-deleted and audio-less tracks",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `30000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const active = `30000001-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const inactive = `30000002-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const pending = `30000003-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    try {
      await query(`INSERT INTO artists (id, name) VALUES ($1, $2)`, [artistId, `CatTest ${suffix}`]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key, is_active)
           VALUES ($1,$2,'Active',120,1000,'audio/a.mp3',true)`, [active, artistId]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key, is_active)
           VALUES ($1,$2,'Inactive',120,1000,'audio/b.mp3',false)`, [inactive, artistId]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key)
           VALUES ($1,$2,'Pending',120,1000,'')`, [pending, artistId]);

      const cat = await getCatalog();
      const ids = new Set(cat.tracks.map((t) => t.id));
      assert.equal(ids.has(active), true, "active track should appear");
      assert.equal(ids.has(inactive), false, "soft-deleted track must be hidden");
      assert.equal(ids.has(pending), false, "audio-less track must be hidden");
    } finally {
      await query(`DELETE FROM tracks WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM artists WHERE id = $1`, [artistId]).catch(() => {});
    }
  },
);
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd backend && node --experimental-strip-types --test src/domain/catalog.test.ts && npm run typecheck`
Expected: test PASS (or skip); typecheck clean. Note: any other code constructing `ArtistTrack` (e.g. tests) now needs `isActive` — fix compile errors if surfaced.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/catalog.ts backend/src/domain/catalog.test.ts
git commit -m "feat(catalog): hide soft-deleted/audio-less tracks, flag isActive"
```

---

## Task 8: Frontend API client + types

**Files:**
- Modify: `frontend/lib/api/types.ts`
- Modify: `frontend/lib/api/client.ts`

**Interfaces:**
- Produces (client functions, all hitting the same-origin `/api/v1` proxy):
  - `getPayoutStatus(): Promise<PayoutStatus>`
  - `startPayoutOnboarding(): Promise<{ url: string }>`
  - `withdrawPayout(): Promise<{ transferId: string; paidMillicents: number; availableMillicents: number }>`
  - `createTrack(input): Promise<{ id: string }>`
  - `presignAudio(trackId, contentType): Promise<{ uploadUrl: string; key: string }>`
  - `commitAudio(trackId, key): Promise<{ ok: boolean; audioKey: string }>`
  - `updateTrack(trackId, fields): Promise<{ ok: boolean }>`
  - `deleteTrack(trackId): Promise<{ ok: boolean; deleted: boolean }>`
  - Types: `PayoutStatus`, `PayoutHistoryRow`

- [ ] **Step 1: Add types to `types.ts`**

First, add `isActive` to the existing `ArtistTrack` type in `frontend/lib/api/types.ts` (the backend now always returns it — Task 7):

```ts
export type ArtistTrack = {
  id: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
  coverImageKey: string | null;
  isActive: boolean;
};
```

(Match the existing field names already present in this type; only the `isActive: boolean` line is new.)

Then append the payout types to `frontend/lib/api/types.ts`:

```ts
export type PayoutHistoryRow = {
  id: string;
  amountMillicents: number;
  status: string;
  createdAt: string;
};
export type PayoutStatus = {
  connected: boolean;
  payoutsEnabled: boolean;
  availableMillicents: number;
  history: PayoutHistoryRow[];
};
```

- [ ] **Step 2: Add client functions to `client.ts`**

Append to `frontend/lib/api/client.ts` (note `req`/`body` helpers and `ApiError` already exist in this file; `import type { PayoutStatus } ...` should be added to the existing type import block):

```ts
// --- Payouts ---------------------------------------------------------------
export const getPayoutStatus = () => req<PayoutStatus>("/artist/payouts/status");
export const startPayoutOnboarding = () => req<{ url: string }>("/artist/payouts/onboard", body({}));
export const withdrawPayout = () =>
  req<{ transferId: string; paidMillicents: number; availableMillicents: number }>(
    "/artist/payouts/withdraw",
    body({}),
  );

// --- Song CRUD -------------------------------------------------------------
export const createTrack = (input: { title: string; durationSeconds: number; pricePerMinuteMillicents?: number }) =>
  req<{ id: string }>("/artist/tracks", body(input));
export const presignAudio = (trackId: string, contentType: string) =>
  req<{ uploadUrl: string; key: string }>("/artist/audio/presign", body({ trackId, contentType }));
export const commitAudio = (trackId: string, key: string) =>
  req<{ ok: boolean; audioKey: string }>("/artist/audio/commit", body({ trackId, key }));
export const updateTrack = (
  trackId: string,
  fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number },
) => req<{ ok: boolean }>(`/artist/tracks/${encodeURIComponent(trackId)}`, { method: "PUT", body: JSON.stringify(fields) });
export const deleteTrack = (trackId: string) =>
  req<{ ok: boolean; deleted: boolean }>(`/artist/tracks/${encodeURIComponent(trackId)}`, { method: "DELETE" });
```

Add `PayoutStatus` to the `import type { ... } from "./types"` list at the top of `client.ts`.

- [ ] **Step 3: Typecheck the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/types.ts frontend/lib/api/client.ts
git commit -m "feat(api): payout + song-crud client functions"
```

---

## Task 9: Frontend PayoutsCard component

**Files:**
- Create: `frontend/lib/payoutState.ts` (pure state derivation)
- Test: `frontend/lib/payoutState.test.ts`
- Create: `frontend/components/artist/PayoutsCard.tsx`

**Interfaces:**
- Consumes: Task 8 client fns + `PayoutStatus` type.
- Produces: `derivePayoutState(status: PayoutStatus | null): "loading" | "not-connected" | "incomplete" | "ready"`; default-exported `PayoutsCard` React client component.

- [ ] **Step 1: Write the failing pure-logic test**

Create `frontend/lib/payoutState.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePayoutState } from "./payoutState.ts";

test("derivePayoutState maps status to UI state", () => {
  assert.equal(derivePayoutState(null), "loading");
  assert.equal(derivePayoutState({ connected: false, payoutsEnabled: false, availableMillicents: 0, history: [] }), "not-connected");
  assert.equal(derivePayoutState({ connected: true, payoutsEnabled: false, availableMillicents: 0, history: [] }), "incomplete");
  assert.equal(derivePayoutState({ connected: true, payoutsEnabled: true, availableMillicents: 5000, history: [] }), "ready");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --experimental-strip-types --test lib/payoutState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helper**

Create `frontend/lib/payoutState.ts`:

```ts
import type { PayoutStatus } from "./api/types";

export type PayoutUiState = "loading" | "not-connected" | "incomplete" | "ready";

export function derivePayoutState(status: PayoutStatus | null): PayoutUiState {
  if (!status) return "loading";
  if (!status.connected) return "not-connected";
  if (!status.payoutsEnabled) return "incomplete";
  return "ready";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --experimental-strip-types --test lib/payoutState.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the component**

Create `frontend/components/artist/PayoutsCard.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPayoutStatus,
  startPayoutOnboarding,
  withdrawPayout,
  ApiError,
} from "@/lib/api/client";
import type { PayoutStatus } from "@/lib/api/types";
import { derivePayoutState } from "@/lib/payoutState";

const usdM = (m: number) => `$${(m / 100000).toFixed(2)}`;

export default function PayoutsCard() {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getPayoutStatus());
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "could not load payouts");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onConnect() {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await startPayoutOnboarding();
      window.location.href = url;
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "could not start setup");
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await withdrawPayout();
      setMsg(`Sent ${usdM(r.paidMillicents)} to your account.`);
      await refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  const state = derivePayoutState(status);

  return (
    <section className="az-card">
      <h2 className="az-card-title">Payouts</h2>

      {state === "loading" && <p className="az-muted">Loading…</p>}

      {state === "not-connected" && (
        <>
          <p className="az-muted">Connect a payout account to withdraw your earnings.</p>
          <button className="btn btn-primary" onClick={onConnect} disabled={busy}>
            Set up payouts →
          </button>
        </>
      )}

      {state === "incomplete" && (
        <>
          <p className="az-muted">Your payout setup isn&apos;t finished yet.</p>
          <button className="btn btn-primary" onClick={onConnect} disabled={busy}>
            Resume setup →
          </button>
        </>
      )}

      {state === "ready" && status && (
        <>
          <p className="az-balance">
            Available: <strong>{usdM(status.availableMillicents)}</strong>
          </p>
          <button
            className="btn btn-primary"
            onClick={onWithdraw}
            disabled={busy || status.availableMillicents < 1000}
          >
            {busy ? "Processing…" : "Withdraw"}
          </button>
          {status.history.length > 0 && (
            <ul className="az-payout-history">
              {status.history.map((h) => (
                <li key={h.id}>
                  {usdM(h.amountMillicents)} — {h.status} —{" "}
                  {new Date(h.createdAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {msg && <p className="az-note">{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (The `az-*` classes reuse the dashboard's existing style vocabulary; if a class is missing it degrades to unstyled, which is fine for the hackathon — note any you want polished later.)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/payoutState.ts frontend/lib/payoutState.test.ts frontend/components/artist/PayoutsCard.tsx
git commit -m "feat(artist-ui): payouts card with connect + withdraw"
```

---

## Task 10: Frontend SongManager component

**Files:**
- Create: `frontend/components/artist/SongManager.tsx`

**Interfaces:**
- Consumes: Task 8 client fns; `ArtistTrack` type (now with `isActive`); the existing `uploadImage(file, presign, commit)` helper pattern in `client.ts` (we call presign/commit directly here for audio).
- Produces: default-exported `SongManager` client component, props `{ initialTracks: ArtistTrack[] }`.

- [ ] **Step 1: Implement the component**

Create `frontend/components/artist/SongManager.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  createTrack,
  presignAudio,
  commitAudio,
  updateTrack,
  deleteTrack,
  ApiError,
} from "@/lib/api/client";
import type { ArtistTrack } from "@/lib/api/types";

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SongManager({ initialTracks }: { initialTracks: ArtistTrack[] }) {
  const [tracks, setTracks] = useState<ArtistTrack[]>(initialTracks);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function probeDuration(f: File): Promise<number> {
    // Read duration from the audio metadata; fall back to 180s if unavailable.
    return new Promise((resolve) => {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Math.max(1, Math.round(el.duration || 180)));
      el.onerror = () => resolve(180);
      el.src = URL.createObjectURL(f);
    });
  }

  async function onAdd() {
    if (!title.trim() || !file) {
      setMsg("Title and an audio file are required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const durationSeconds = await probeDuration(file);
      const { id } = await createTrack({ title: title.trim(), durationSeconds });
      const { uploadUrl, key } = await presignAudio(id, file.type);
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      await commitAudio(id, key);
      setTracks((t) => [
        { id, title: title.trim(), durationSeconds, pricePerMinuteMillicents: 1000, coverImageKey: null, isActive: true },
        ...t,
      ]);
      setTitle("");
      setFile(null);
      setMsg("Song added.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(track: ArtistTrack) {
    const next = window.prompt("New title", track.title);
    if (!next || next.trim() === track.title) return;
    try {
      await updateTrack(track.id, { title: next.trim() });
      setTracks((t) => t.map((x) => (x.id === track.id ? { ...x, title: next.trim() } : x)));
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "rename failed");
    }
  }

  async function onDelete(track: ArtistTrack) {
    if (!window.confirm(`Delete "${track.title}"? It will be hidden from the catalog.`)) return;
    try {
      await deleteTrack(track.id);
      setTracks((t) => t.filter((x) => x.id !== track.id));
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "delete failed");
    }
  }

  return (
    <section className="az-card">
      <h2 className="az-card-title">Your songs</h2>

      <div className="az-add-song">
        <input
          type="text"
          placeholder="Song title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <input
          type="file"
          accept="audio/mpeg,audio/mp4,audio/wav,audio/flac,audio/aac"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={onAdd} disabled={busy}>
          {busy ? "Uploading…" : "Add song"}
        </button>
      </div>

      <ul className="az-song-list">
        {tracks.map((t) => (
          <li key={t.id} className={t.isActive ? "" : "az-inactive"}>
            <span>{t.title}</span>
            <span className="az-muted">{dur(t.durationSeconds)}</span>
            <button className="btn btn-ghost" onClick={() => onRename(t)}>Rename</button>
            <button className="btn btn-ghost" onClick={() => onDelete(t)}>Delete</button>
          </li>
        ))}
      </ul>

      {msg && <p className="az-note">{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/artist/SongManager.tsx
git commit -m "feat(artist-ui): song manager — add/rename/delete with audio upload"
```

---

## Task 11: Wire components into the dashboard + final verification

**Files:**
- Modify: `frontend/app/(artist)/artist/page.tsx`
- Verify: `backend/src/router.ts` has all 8 routes (3 payout + 5 song) registered exactly once.

**Interfaces:**
- Consumes: `PayoutsCard` (Task 9), `SongManager` (Task 10), `serverArtistSummary` (existing).

- [ ] **Step 1: Mount the cards**

In `frontend/app/(artist)/artist/page.tsx`, add imports at the top:

```tsx
import PayoutsCard from "@/components/artist/PayoutsCard";
import SongManager from "@/components/artist/SongManager";
```

Inside the `{summary && ( <> ... </> )}` block (where the dashboard content renders), add the two cards. Place them after the existing `ProfileEditor` / track list section:

```tsx
        <PayoutsCard />
        <SongManager initialTracks={summary.tracks} />
```

(`summary.tracks` is the `ArtistTrack[]` from `serverArtistSummary`; it now carries `isActive`. If the local `summary` shape is named differently in this file, match the existing accessor used for the track list.)

- [ ] **Step 2: Verify route registration**

Run:
```bash
cd backend && grep -nE "artist/(payouts|tracks|audio)" src/router.ts
```
Expected: 8 lines — `/artist/payouts/onboard`, `/artist/payouts/status`, `/artist/payouts/withdraw`, `/artist/tracks` (POST), `/artist/audio/presign`, `/artist/audio/commit`, `/artist/tracks/{id}` (PUT), `/artist/tracks/{id}` (DELETE). No duplicates.

- [ ] **Step 3: Full backend test + typecheck**

Run:
```bash
cd backend && npm test && npm run typecheck
```
Expected: all tests pass (DSQL-dependent ones pass if `TOLLROAD_DSQL_ENDPOINT` set, else skip); typecheck clean.

- [ ] **Step 4: Frontend build**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run build
```
Expected: type-check clean; Next.js build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/(artist)/artist/page.tsx
git commit -m "feat(artist-ui): mount payouts + song manager on dashboard"
```

---

## Deploy checklist (post-merge, manual)

1. Apply the DSQL migration once against the shared/prod instance (Task 0, Step 2).
2. Set `TOLLROAD_AUDIO_BUCKET` to the bucket fronted by the streaming CloudFront distribution (so uploaded audio is actually streamable). For local demo it falls back to `TOLLROAD_IMAGES_BUCKET`.
3. Set `TOLLROAD_APP_BASE_URL` to the public app origin (used for Stripe onboarding return/refresh URLs). Defaults to `http://localhost:3000`.
4. In the Stripe Dashboard, enable **Connect** (Express) for the platform account. No new secret keys are required — Connect uses the existing `STRIPE_SECRET_KEY`. Confirm test vs live mode matches the rest of the Stripe config (memory: all Stripe keys must be the same mode).
5. Ensure `deploy.mjs` forwards `TOLLROAD_AUDIO_BUCKET` and `TOLLROAD_APP_BASE_URL` to the Lambda (add them to the context vars if not already passed), and does not drop existing secrets.

## Out of scope / follow-ups
- Connect webhooks (`account.updated`, `transfer.*`) for fully event-driven status — current design polls on dashboard return; sufficient for the demo.
- S3 lifecycle / virus scanning on uploaded audio.
- Per-track cover upload during create (covers already have their own flow; create starts coverless).
- Editing duration via the UI beyond auto-probe (backend supports it via `PUT`).
