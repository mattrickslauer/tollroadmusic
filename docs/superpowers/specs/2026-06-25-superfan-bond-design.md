# Superfan Bond — Design Spec

**Date:** 2026-06-25
**Status:** Approved for Phase 1 build
**Author:** brainstormed with the team

## Thesis

Today a fan on tollroadmusic is a wallet that pays per minute, anonymously and
transactionally. The Superfan Bond turns **every minute listened into a visible,
named, ranked relationship with a specific artist.** Money spent becomes social
standing. The relationship *levels up* over time and *can be lost to a rival
fan* — which is what makes it addictive and what makes it a genuine
reimagining of the artist↔fan bond.

The metered, pay-per-minute economy is the unfair advantage here: minutes are
real money, so Bond Points cannot be farmed for free. The investment signal is
honest.

## Decisions locked during brainstorming

- **Primary focus:** the fan as patron.
- **Core fantasy:** superfan loyalty — reward depth (total minutes/dollars given
  to an artist), not just early discovery.
- **Bond shape:** **per-artist** bonds. A fan has a separate, leveling
  relationship with each artist. The profile becomes a wall of bonds.
- **v1 hero payoff:** status & recognition. Unlockables, economic perks, and
  artist-granted access are later phases (see Rollout).
- **Leaderboard privacy:** fans shown by **handle, not real identity** (reusing
  the existing `ownerHandle` concept). Public-by-handle by default.

## The core mechanic (Phase 1)

Every fan has a **Bond** with each artist they have listened to. It accrues
**Bond Points (BP)**.

### Bond Points formula

BP is derived entirely from data already collected in streaming history. v1
formula (kept simple and tunable in one place):

```
basePoints   = minutes listened to that artist            // 1 BP per minute
streakBonus  = basePoints earned today * (streakMultiplier - 1)
BP           = sum over history of basePoints + streakBonus
```

- Minutes are already metered and billed, so they are an honest investment
  signal. We use minutes (not raw cents) as the unit so a future per-minute
  price change does not retroactively rewrite everyone's BP. (Cents and minutes
  are ~proportional today.)
- `streakMultiplier` starts at 1.0 and is documented in the tuning section.
- All thresholds and multipliers live in a single `bondConfig` module so they
  are tunable without hunting through the codebase.

### Tiers

Each bond climbs named tiers. v1 tier ladder (thresholds in BP, tunable):

| Tier      | Threshold (BP) |
|-----------|----------------|
| Listener  | 0              |
| Regular   | 30             |
| Fan       | 120            |
| Superfan  | 480            |
| Devotee   | 1500           |

A **progress bar** shows BP toward the next tier. Crossing a threshold fires a
**tier-up celebration** in the now-playing UI.

### Streaks

A daily streak flame (account-wide in v1 for simplicity — "did you listen at all
today") keeps a BP multiplier alive. Missing a day resets the flame. The
multiplier and reset window are in `bondConfig`. Streaks are the daily-return,
loss-aversion engine.

### #1 Fan race / leaderboard

Per artist, fans are ranked by BP. The top fan wears a crown on the artist page.
Each fan sees their own rank ("you're #3 of 412 backers") and how close the next
rival is. This is the competitive re-engagement engine and costs nothing extra
to surface.

### The collection

A fan's profile is a **wall of bonds** across every artist they back, each at its
own tier. This creates "go deep on a few vs. spread wide" tension and
completionist pull, and is the shareable identity surface.

## The four addictive loops (design intent)

| Loop      | Horizon   | Mechanic                                            |
|-----------|-----------|-----------------------------------------------------|
| Moment    | seconds   | BP ticks up live while listening; tier-up celebration |
| Daily     | days      | streak flame + multiplier; loss aversion            |
| Social    | ongoing   | leaderboard rank; defend your #1 spot               |
| Collection| long      | wall of bonds; depth-vs-breadth; completionism      |

## Surfaces (Phase 1)

A status system is only as addictive as it is visible and contested.

1. **Artist page** (`/artists/[id]`): a **Bond card** at the top (tier, BP,
   progress to next, streak flame, "you're #3 of 412 backers") and the
   **Superfan leaderboard** (top fans by handle, crown on #1).
2. **Player / now-playing:** live BP ticking as you listen and the **tier-up
   celebration** overlay. The dopamine happens during listening, not in a menu.
   Hooks into the existing 100ms meter loop in `PlayerProvider`.
3. **Fan profile (NEW page, `/u/[handle]`):** the public wall of bonds — the
   shareable flex/identity surface. The one genuinely new page.
4. **Browse / home:** a re-engagement rail — "bonds about to level up," "your #1
   spot is threatened," "an artist you back just dropped a track."
5. **In-app nudges:** streak-about-to-break / rank-threatened / near-tier-up
   surfaced inline. Real push notifications are deferred.

## Architecture

### Backend (new endpoints, aggregation over existing data)

All v1 endpoints are **read-only aggregations** of existing streaming-history
tables. No new write paths, no billing changes. Exact table/column names are
filled in from the backend map; the contracts are:

- `GET /api/v1/artists/:id/bond` → the current user's bond with that artist:
  `{ artistId, artistName, bondPoints, tier, nextTier, progressToNext,
     rank, totalFans, streakDays }`
- `GET /api/v1/artists/:id/leaderboard?limit=N` → top fans for that artist:
  `{ entries: [{ handle, displayName, bondPoints, tier, rank }], totalFans }`
- `GET /api/v1/me/bonds` → the current user's wall of bonds:
  `{ bonds: [BondSummary], streakDays }` sorted by BP desc.
- `GET /api/v1/u/:handle/bonds` → a public profile's bonds (handle-scoped,
  same shape as `/me/bonds` minus private data) for the fan profile page.

BP computation, tier thresholds, and streak logic live in a **single shared
`bondConfig` + pure `bondMath` module** used by all endpoints, so the math is
defined once and unit-tested in isolation. Aggregation is computed on read in
v1 (history volumes are small); if performance requires it later, a materialized
`bond` table is a drop-in behind the same contracts.

### Frontend

- **`BondProvider`** (new React context): subscribes to the existing player meter
  events, accrues live BP for the currently-playing artist, and fires a
  `tier-up` event when a threshold is crossed (client-side optimistic, reconciled
  against the server on track change / page load). Mounted once alongside the
  existing `PlayerProvider` / `LibraryProvider`.
- **Components** (pure CSS, `.lx-` token system, matching existing style):
  - `BondCard` — artist-page bond summary.
  - `SuperfanLeaderboard` — ranked fans with crown/flair.
  - `BondMeter` — the live progress bar shown in the player bar.
  - `TierUpCelebration` — the in-player celebration overlay.
  - `BondWall` — the grid of bonds for the fan profile page.
  - `BondRail` — the browse re-engagement rail.
- **New page:** `/u/[handle]` fan profile rendering `BondWall`.
- **API client + types:** new typed wrappers in `lib/api/` mirroring the four
  endpoints; new types `Bond`, `BondSummary`, `LeaderboardEntry`, `Tier`.

### Data flow

```
existing meter loop (PlayerProvider, 100ms)
        │ minutes accrued for current track/artist
        ▼
   BondProvider  ──fires──▶ TierUpCelebration (on threshold cross)
        │ optimistic live BP
        ▼
  BondMeter (player)        BondCard / Leaderboard (artist page)
                                   ▲
                            GET /artists/:id/bond + /leaderboard
                                   │
                            bondMath over streaming history (server)
```

## Error handling & edge cases

- Endpoints return an **empty/zero bond** (`tier: Listener, bondPoints: 0`) for an
  artist the user has never played, rather than 404 — the UI always has something
  to render and a "start your bond" empty state.
- Leaderboard for an artist with no listeners returns `{ entries: [], totalFans: 0 }`.
- A user with no handle yet: profile page `/u/[handle]` 404s gracefully; the
  Bond card still works (rank shown, handle omitted from leaderboard until set).
- Client-side optimistic BP is always reconciled against the server response;
  the server is the source of truth. A tier-up that the server later disagrees
  with simply doesn't re-fire (idempotent celebration keyed by `(artistId, tier)`).
- All new endpoints require the existing auth/session; unauthenticated requests
  get the existing 401 behavior.

## Testing

- **`bondMath` unit tests** (pure functions): BP from minutes, tier resolution at
  boundaries (exactly at threshold, one below, one above), progress-to-next,
  streak multiplier application, streak reset window.
- **Leaderboard ranking** test: tie-breaking, limit, rank assignment.
- **`BondProvider`** test: tier-up event fires once per threshold crossing and is
  idempotent; reconciliation against server overrides optimistic state.
- Endpoint integration smoke tests against a seeded history fixture.

## Rollout (the strategy beyond v1)

- **Phase 1 (this spec):** the full status engine on existing data — bonds,
  tiers, streaks, leaderboards, the player tier-up moment, and the fan profile
  wall. A complete, addictive product with no billing or artist-tooling changes.
- **Phase 2 — Unlockables:** superfan-only visualizers, milestone animations,
  lyric/liner reveals hung off bond tiers. Pure frontend.
- **Phase 3 — Economic perks:** streak → bonus wallet credit, loyalty rate
  breaks. Touches the metered billing system; done once the loop is proven.
- **Phase 4 — Artist-granted access:** artists see their superfans and grant
  shoutouts, exclusive drops, DMs. Needs artist-side tooling; the deepest bond,
  built last. Phase 1's leaderboard data is exactly what artists need here.

## Explicitly out of scope for v1 (YAGNI)

Economic perks, artist tooling, DMs, real push notifications, unlockable content,
algorithmic recommendations. v1 is the status engine and its visible surfaces —
nothing more.
