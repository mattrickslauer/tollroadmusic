# Creator-Set Variable Rates (sub-cent precision + free tier)

**Date:** 2026-06-25
**Status:** Approved design — ready for implementation plan

## Summary

Today every track is metered at a flat default of 1¢ per listening-minute. We want
creators to set their own rate on each piece of content — any value from **free (0)**
up to a capped maximum, at **sub-cent precision** (e.g. 0.5¢/min).

The key insight from exploring the codebase: the per-track rate is **already plumbed
end to end**. `charge.ts` debits `track.pricePerMinuteCents` per metered minute — it
reads that number from the track row, not a constant. The catalog response, the x402
402 body, and the player already carry the per-track value. The flat "1¢" is only the
column default (`price_per_minute_cents INTEGER DEFAULT 1`).

So this feature is **not** "build variable pricing." It is three smaller things:

1. A **write path** so creators can set the rate the meter already honors (none exists
   today — tracks are seeded, and there is no upload/edit flow).
2. A **base-unit migration** (cents → millicents) so sub-cent rates are representable,
   because every monetary value in the system is currently integer cents.
3. A **free tier** (rate 0) that streams by metering at zero, with no new branch in the
   auth/stream path.

## Goals

- Creators can set a per-minute rate per track: `0` (free) up to a hard cap.
- Sub-cent precision: rate granularity of **0.1¢/min** (100 millicents).
- Hard ceiling of **$1.00/min** (100,000 millicents) to protect listeners.
- Free (0-rate) content plays without requiring a wallet balance.
- Free plays still count in minutes-played / engagement stats (creators see reach).
- Preserve all current billing invariants: one ledger row per metered minute, the
  `<user>#<track>#<minute>` idempotency key, and the `hasRecentCharge` streaming gate.

## Non-Goals

- No new pricing *units* — still per-minute metering only. No flat-per-play, no
  per-second. (Confirmed during brainstorming.)
- No creator **upload** pipeline. This feature edits the rate on tracks an artist
  already owns; building artist-driven uploads is separate prerequisite work.
- No bitrate-aware or content-type-aware pricing (that belongs with video support).

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Pricing model | Variable per-minute **+ free tier** (rate 0). |
| How free content streams | **Meter at zero + log plays** — same charge loop, debit 0, ledger/meter rows still written so stats count free plays. |
| Rate precision | **Sub-cent** — forces a money base-unit change. |
| Money-unit strategy | **Millicents everywhere** (cents × 1000), convert only at the Stripe boundary. |
| Rate step / granularity | 100 millicents = **0.1¢/min**. |
| Rate ceiling | 100,000 millicents = **$1.00/min**. |

## Architecture

### 1. Base-unit migration: cents → millicents

Every monetary column moves to millicents (existing value × 1000) in a single,
idempotent migration. Rename the columns so the unit is explicit in the name:

| Table.column (today) | Becomes |
| --- | --- |
| `listener_profiles.balance_cents` | `balance_millicents` |
| `royalty_ledger.amount_cents` | `amount_millicents` |
| `wallet_topups.amount_cents` | `amount_millicents` |
| `tracks.price_per_minute_cents` | `price_per_minute_millicents` |

Backfill = multiply existing rows by 1000. (Any precomputed per-artist/day summary
columns that store cents move in lockstep.)

**Code constants scale ×1000** (`backend/src/domain/billing.ts`):

- `TOPUP_CENTS` 1000 → `TOPUP_MILLICENTS` 1,000,000
- `ONBOARDING_GIFT_CENTS` 300 → `ONBOARDING_GIFT_MILLICENTS` 300,000
- `LIKE_COST_CENTS` 1 → `LIKE_COST_MILLICENTS` 1000
- The default rate (DB `DEFAULT`) 1 → 1000

**Stripe stays in whole cents.** Convert only at its two boundaries:

- **Top-up credit** (`creditTopup`, Stripe webhook): `millicents = stripeCents × 1000`.
- **Payout** (Express Connect): `stripeCents = round(millicents / 1000)`. Rounding
  policy: round to nearest whole cent; any sub-cent remainder stays in the artist's
  accrued balance and carries to the next payout (no money created or destroyed).
- `cardFeeCents` continues to operate in cents at the Stripe boundary.

**DynamoDB hot path** (`backend/src/domain/meter.ts`): the METER item's `amountCents`
attribute becomes `amountMillicents`, and the rollup Lambda (`infra/lambda/rollup`)
aggregates millicents. Both sides move together so the idempotency reconciliation
(`ON CONFLICT DO NOTHING`) is unaffected.

**Invariants preserved.** The charge loop still writes exactly one `royalty_ledger`
row per wall-clock minute, keyed `<user>#<track>#<minute>`. `hasRecentCharge` still
gates streaming on a recent row. Only the *unit* of the stored amount changes.

### 2. Rate write path

New endpoint, mirroring the existing `coverCommit` ownership pattern in
`backend/src/handlers/artist-content.ts`:

```
POST /v1/artist/track/rate
body: { trackId: string, ratePerMinuteMillicents: number }
```

Handler flow:

1. `requireSession` → `requireArtist(accountId)` (403 if not an artist).
2. Validate `ratePerMinuteMillicents`:
   - integer
   - `0 <= rate <= 100_000`
   - `rate % 100 === 0` (0.1¢ step)
   - else `400 invalid rate`.
3. Ownership-scoped update (new `setTrackRate` in `domain/artist-content.ts`):
   ```sql
   UPDATE tracks SET price_per_minute_millicents = $rate
   WHERE id = $trackId AND artist_id = $artistId
   ```
   `rowCount === 0` → `403 not your track` (same as `setTrackCover`).
4. Return `{ ok: true, ratePerMinuteMillicents }`.

### 3. Free tier (rate 0): meter at zero

No new branch in `stream.ts` or the player. A 0-rate track runs the identical charge
loop debiting 0:

- `chargeMinute` UPDATE `WHERE balance_millicents >= 0` succeeds even at empty balance,
  so free content plays with no funds.
- The `royalty_ledger` row (amount 0) and the DynamoDB METER event still write, so
  minutes-played / engagement stats count free plays uniformly. Creators see reach on
  free content with zero extra analytics wiring.
- The x402 402 path is simply never hit for 0-rate content (the debit always succeeds).

### 4. Frontend

- **Artist dashboard:** a rate input per track in the existing track editor
  (`frontend/components/artist/`), alongside the cover-upload control. Entered in
  cents (e.g. `0.5`), sent as millicents (`× 1000`). Validate step/cap client-side too.
  "Free" is rate 0, shown as a distinct toggle/label.
- **Listener display:** the catalog/track types already carry the per-minute value;
  rename `pricePerMinuteCents` → `pricePerMinuteMillicents` across
  `frontend/lib/api/types.ts` and components, and format `÷ 1000` for display
  (e.g. "0.5¢/min", or "Free" when 0).
- Balance / wallet displays divide millicents by 1000 for cents, by 100,000 for dollars.

### 5. API & type changes

- `backend/openapi.yaml`: `pricePerMinuteCents` → `pricePerMinuteMillicents` on
  `Track`/`CatalogTrack`; add the new `/artist/track/rate` route.
- Backend domain types (`domain/tracks.ts`, `catalog.ts`, `library.ts`,
  `artist-public.ts`, `lib/x402.ts`) and the x402 402 body field rename to millicents.
- Frontend `lib/api/types.ts` mirrors the rename.

## Error Handling

- Invalid rate (non-integer, out of `[0, 100000]`, wrong step) → `400`.
- Editing a track you don't own → `403` (ownership-scoped UPDATE returns 0 rows).
- Free content with empty wallet → plays (0 debit succeeds); never returns 402.
- Migration is idempotent and re-runnable; a partial run leaves balances correct
  because the rename+backfill is a single transaction per table.

## Testing

- **Billing math:** charge at fractional rates (e.g. 500 millicents/min), verify the
  debited amount and ledger row are in millicents.
- **Free tier:** 0-rate track plays at empty balance; ledger/meter rows written with
  amount 0; appears in minutes-played.
- **Validation:** reject non-integer, negative, `> 100000`, and off-step rates;
  accept 0 and on-step values.
- **Ownership:** non-owner rate update → 403.
- **Migration parity:** snapshot `sum(balance_cents)` pre-migration; assert
  `sum(balance_millicents) === pre × 1000` post-migration. Same for ledger totals.
- **Stripe boundary:** top-up of N cents credits `N × 1000` millicents; payout of
  millicents converts to whole cents with sub-cent remainder carried.

## Rollout / Risk

This touches a **live wallet**, so the migration is the high-risk step:

1. Write the migration idempotently (rename + `× 1000` backfill per table).
2. Snapshot balances and ledger sums before running.
3. Run migration; verify the ×1000 parity assertions.
4. Deploy backend + frontend together (the field rename is not backward-compatible
   across the API contract), using the project's secret-safe Lambda deploy recipe so
   deploy doesn't drop billing/session secrets.
5. The DynamoDB METER field rename and the rollup Lambda must deploy together; in-flight
   METER events written with the old `amountCents` name during the cutover window should
   be drained first (brief metering pause) or the rollup should read both names for one
   release.

## Open follow-ups (out of scope here)

- Rate-change history / audit (who set what, when) — not required for v1.
- Per-content-type pricing and bitrate-aware metering — belongs with video support.
- Creator upload pipeline — prerequisite for new content but tracked separately.
