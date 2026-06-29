# Artist Payouts (Stripe Connect) + Song CRUD — Design

**Date:** 2026-06-28
**Status:** Approved, ready for implementation planning
**Context:** AWS hackathon. Goal: artists can (1) connect a payout account and withdraw their earnings, and (2) create / update / delete their own songs from the dashboard.

---

## 1. Goals & Non-Goals

### Goals
- Artists onboard to **Stripe Connect Express** and withdraw accrued earnings on demand.
- Artists perform full **song CRUD** from the dashboard: create (with real audio upload), edit metadata/rate, soft-delete.
- Stay entirely on the existing serverless stack (Lambda + API Gateway + Aurora DSQL + S3) — nothing new to provision.
- Correctness of money math (no lost sub-cents, no double payouts).

### Non-Goals (YAGNI for the hackathon)
- Stripe Connect **webhooks** (`account.updated`, transfer events). Replaced by synchronous transfers + on-return status polling. Optional hardening later.
- Scheduled / automatic payouts. On-demand withdraw only.
- Hard deletes of tracks. Soft delete only, to preserve `royalty_ledger` integrity.
- Multi-currency. USD only.
- Standard/Custom Connect account types.

---

## 2. Architecture & AWS Posture

| Concern | Mechanism | Why it scales |
|---|---|---|
| New endpoints | Lambda + API Gateway, existing router/handler pattern | Serverless, auto-scales per request |
| New tables | Aurora DSQL (serverless, auto-scaling) | No capacity planning |
| Audio upload | S3 **presigned PUT** (browser → S3 directly) | Lambda never handles file bytes; uploads don't bottleneck compute |
| Payouts | Stripe Connect Express (Stripe-hosted KYC) | Platform holds zero PII; compliance offloaded |
| Payment safety | Idempotency keys on transfers | Retries / double-clicks cannot double-pay |

All money is represented in **millicents** internally (cents × 1000), converted to whole cents only at the Stripe boundary via the existing `millicentsToStripeCents` / `stripeCentsToMillicents` helpers in `backend/src/domain/billing.ts`.

---

## 3. Money Flow (Crux)

Earnings already accrue in `royalty_ledger` (one row per metered minute: `artist_id`, `track_id`, `amount_millicents`). We add a **withdrawal ledger** (`payout_transfers`). Available balance is derived, never stored as a mutable counter:

```
available_millicents(artist A)
   = SUM(royalty_ledger.amount_millicents      WHERE artist_id = A)
   − SUM(payout_transfers.amount_millicents     WHERE artist_id = A AND status <> 'failed')
```

### Withdraw flow
1. **Guard:** artist has `stripe_account_id` set AND `payouts_enabled = true`.
2. Compute `available_millicents`; convert to whole **cents** payable via `payableCents = Math.floor(available_millicents / 1000)`. Note: this deliberately **floors** rather than using the existing `millicentsToStripeCents` (which *rounds*) — flooring guarantees we never transfer more than the artist has earned. The sub-cent remainder (`available_millicents − payableCents*1000`) stays available for the next withdrawal — no money lost.
3. If payable cents ≤ 0, reject with a clear "nothing to withdraw" error.
4. `stripe.transfers.create({ amount: cents, currency: 'usd', destination: stripe_account_id }, { idempotencyKey })`. The Transfer is **synchronous** — it returns immediately with an id.
5. Insert `payout_transfers` row `{ id, artist_id, amount_millicents: cents*1000, stripe_transfer_id, status: 'paid', created_at }`.
6. **Concurrency guard:** steps 1–5 run inside a single DSQL transaction that re-computes `available` and inserts atomically, so two simultaneous withdraw clicks cannot both pass the balance check. The Stripe call's `idempotencyKey` is derived from `(artist_id, payable_cents, transaction nonce)` so an automatic retry of the same logical withdraw does not create a second transfer.

### Onboarding completion (no webhook)
- On creating the Express account we set nothing optimistic.
- When the artist returns from Stripe's hosted onboarding (return_url → dashboard), the frontend calls `GET /v1/artist/payouts/status`, which **retrieves the account from Stripe** and sets `payouts_enabled = account.payouts_enabled && account.details_submitted`, persisting it to the `artists` row. This is the single source of truth for the "Ready" state.

---

## 4. API Surface

All endpoints require `requireSession(req)` then `requireArtist(...)` (existing helpers). Money fields are millicents.

### Payouts
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/artist/payouts/onboard` | — | `{ url }` (Stripe-hosted onboarding link; creates Express account if none) |
| GET | `/v1/artist/payouts/status` | — | `{ connected, payoutsEnabled, availableMillicents, history: PayoutRow[] }` (refreshes `payouts_enabled` from Stripe) |
| POST | `/v1/artist/payouts/withdraw` | — | `{ transferId, paidMillicents, availableMillicents }` |

`PayoutRow = { id, amountMillicents, status, createdAt }`.

### Song CRUD
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/artist/tracks` | `{ title, durationSeconds, pricePerMinuteMillicents }` | `{ id }` |
| POST | `/v1/artist/audio/presign` | `{ trackId, contentType }` | `{ url, key }` (S3 presigned PUT) |
| POST | `/v1/artist/audio/commit` | `{ trackId, key }` | `{ ok: true }` (sets `audio_key`) |
| PUT | `/v1/artist/tracks/{id}` | `{ title?, durationSeconds?, pricePerMinuteMillicents? }` | `{ ok: true }` (ownership-checked) |
| DELETE | `/v1/artist/tracks/{id}` | — | `{ ok: true }` (soft delete: `is_active = false`) |

Ownership enforced via existing `ownsTrack(artistId, trackId)`. Audio upload reuses the existing cover/avatar presign→commit pattern (same S3 bucket conventions, key prefixing).

---

## 5. Data Model Changes (`infra/scripts/migrate-dsql.mjs`)

```sql
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS payout_transfers (
  id                 uuid PRIMARY KEY,
  artist_id          uuid NOT NULL,
  amount_millicents  bigint NOT NULL,
  stripe_transfer_id text,
  status             text NOT NULL DEFAULT 'paid',  -- 'paid' | 'failed'
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_transfers_artist ON payout_transfers (artist_id);
```

- `getCatalog()` and public artist/track reads filter `WHERE is_active`.
- `getArtistSummary()` returns the artist's own tracks including inactive ones, each flagged with `isActive` so the dashboard can show/grey them.

⚠️ **Shared DSQL across worktrees:** a single DSQL instance backs every local checkout. The migration must be run **once**, deliberately, against the shared instance. `deploy.mjs` does **not** auto-run migrations. Use `IF NOT EXISTS` (above) so re-runs are safe.

---

## 6. Frontend (Artist Dashboard)

### Payouts card — `frontend/components/artist/PayoutsCard.tsx`
State machine, driven by `GET /v1/artist/payouts/status`:
- **Not connected** (`!connected`) → "Set up payouts" button → `POST /onboard` → redirect to `url`.
- **Onboarding incomplete** (`connected && !payoutsEnabled`) → "Resume setup" button → `POST /onboard` again (Stripe resumes).
- **Ready** (`payoutsEnabled`) → shows `availableMillicents`, a **Withdraw** button (disabled when balance is 0 or a withdraw is in-flight), and payout history.
- Handles the `?payouts=return` query param on dashboard load by re-fetching status.

### Song manager — `frontend/components/artist/SongManager.tsx`
- **Add song**: form (title, duration, rate) → `POST /tracks` → `POST /audio/presign` → browser `PUT` to S3 with upload progress → `POST /audio/commit`.
- **Edit**: inline edit of title/duration/rate → `PUT /tracks/{id}`.
- **Delete**: confirm dialog → `DELETE /tracks/{id}`; row greys out / disappears from active list.
- Follows existing `ProfileEditor.tsx` conventions (fetch helpers in `frontend/lib/`, optimistic UI where safe).

Both cards are mounted on `frontend/app/(artist)/artist/page.tsx` in the final wiring pass.

---

## 7. Parallelization Plan

Five file-isolated streams, executed with git worktrees so they don't collide.

| Stream | Owned files (no overlap) | Depends on |
|---|---|---|
| **0. Migration** | `infra/scripts/migrate-dsql.mjs` | — (lands first) |
| **A. Payouts backend** | `backend/src/domain/payouts.ts`, `backend/src/handlers/payouts.ts` + tests | 0 |
| **B. Song-CRUD backend** | `backend/src/domain/tracks-crud.ts`, extend `backend/src/handlers/artist-content.ts` + tests | 0 |
| **C. Payouts frontend** | `frontend/components/artist/PayoutsCard.tsx`, fetch helpers | A's API contract |
| **D. Song-CRUD frontend** | `frontend/components/artist/SongManager.tsx`, fetch helpers | B's API contract |

**Shared integration points**, done in a short **final wiring pass** (single agent, sequential) to avoid merge conflicts:
- `backend/src/router.ts` — register the new routes (additive).
- `frontend/app/(artist)/artist/page.tsx` — mount `PayoutsCard` + `SongManager`.

Backend A and B are fully independent and run in parallel. Frontend C and D code against the API contracts in §4 and run in parallel.

---

## 8. Testing (TDD)

Write tests before implementation for the risky logic:
- **Money math:** millicents→cents floor + remainder retention; `available_millicents` computation across multiple ledger rows and prior payouts.
- **Concurrency:** two concurrent withdraws — exactly one succeeds; the second sees reduced/zero balance.
- **Guards:** withdraw rejected when `payouts_enabled = false` or no `stripe_account_id`; withdraw rejected when balance ≤ 0.
- **Ownership:** edit/delete rejected for tracks the caller does not own.
- **Soft delete:** inactive tracks excluded from public catalog, included (flagged) in artist's own summary.
- **Frontend:** payouts card state-machine transitions; upload presign→commit happy path.

Use the local Stripe demo fallback pattern (when `STRIPE_SECRET_KEY` unset) where feasible so tests don't hit live Stripe.

---

## 9. Deploy & Secrets Notes (from project memory)

- No new required Stripe secrets — Connect uses the existing `STRIPE_SECRET_KEY`. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unaffected.
- `deploy.mjs` passes secrets via `-c key=value`; do not let it drop existing secrets. No new secret is mandatory for this feature.
- All Stripe keys must remain in the same mode (live vs test).
- Run the DSQL migration manually against the shared instance before/with deploy.
