# Artist dashboard — mobile + UX rework

**Date:** 2026-06-28
**Scope:** `frontend/app/(artist)/artist/page.tsx`, `frontend/styles/artist.css`,
`frontend/app/globals.css` (nav only). No backend, data, or behavior changes.

## Problem

The artist dashboard (`/artist`) has two classes of problems:

1. **Responsive breakages.**
   - `.az-page` uses a fixed `28px` side padding that never tightens on phones.
   - The Recent-activity `<table>` does not reflow and overflows narrow viewports.
   - Nav links (`Browse music`, `Dashboard`) are *hidden entirely* at `≤760px`
     (`globals.css`), leaving no in-page navigation on mobile.
   - Avatar row, per-track cover rows, and the rate editor can overflow / not wrap.

2. **UX / styling gaps.**
   - The page opens with a **profile-editing form** before the artist sees any
     earnings — the headline numbers are buried below the editor.
   - `SongManager` and `PayoutsCard` reference classes that are **defined nowhere**
     (`.az-card`, `.az-card-title`, `.az-add-song`, `.az-song-list`, `.az-muted`,
     `.az-note`, `.az-balance`, `.az-payout-history`, `.az-inactive`) — those two
     sections currently render as unstyled browser-default HTML. The per-track
     `.az-rate-editor / .az-rate-controls / .az-rate-input` block is also unstyled.

## Goals

- Keep the existing warm asphalt/amber/green brand and tokens (`globals.css`).
- No new dependencies, no JS for navigation, no behavior changes to upload/save.
- Mobile-first, thumb-friendly, and a section order that leads with value.

## Design

### 1. Section reorder (`page.tsx`)

Render order becomes (for the signed-in, has-profile case):

```
Header → Stats → Recent activity → Payouts → Songs (SongManager) → Profile & track settings (ProfileEditor)
```

Earnings headline first, then the detail, then cash-out, then catalog management,
then profile/track settings last. Components are independent client components;
reordering JSX is safe. The empty/CTA/not-configured states are unchanged.

### 2. Style the unstyled cards (`artist.css`)

Introduce a shared card primitive consistent with the existing `.az-editor-section`
(background `--asphalt-800`, `1px solid var(--line-soft)`, radius `--r-lg`,
padding `28px`):

- `.az-card` — the card shell (used by SongManager + PayoutsCard).
- `.az-card-title` — section heading, matches `.az-recent-h`.
- `.az-add-song` — add-song form row; flex with wrap, inputs grow, button shrinks.
- `.az-song-list` — reset list; each `<li>` a flex row: title (grow) · duration
  (mono, muted) · Rename · Delete, separated by `--line-soft` dividers.
- `.az-muted`, `.az-note` — muted/secondary copy (`--bone-dim` / `--bone-faint`).
- `.az-balance` — emphasized available-balance line; the amount in `--meter-green`.
- `.az-payout-history` — reset list of past payouts, mono, muted.
- `.az-inactive` — dimmed + strikethrough for soft-deleted tracks.
- `.az-rate-editor` — vertical stack; `.az-rate-controls` flex-wrap row;
  `.az-rate-input` a narrow (`~120px`) number input.

### 3. Responsive rules (`artist.css`)

- `.az-page` side padding tightens to `~16px` at `≤640px` (top/bottom reduced too).
- `.az-stats` — at `≤520px`, force a clean **2×2** grid
  (`grid-template-columns: 1fr 1fr`) instead of a tall single-column stack;
  reduce `.az-stat` padding and `.az-stat-v` font slightly.
- **Activity table → cards** at `≤640px`: hide `thead`; each `<tr>` becomes a
  bordered card; each `<td>` is a flex row with its label rendered via
  `content: attr(data-label)` on `::before`. Requires adding `data-label`
  attributes to the three `<td>`s in `page.tsx` (`Day`, `Minutes`, `Earned`).
- Add-song form, rate controls, avatar row, and track-cover rows use `flex-wrap`
  so they stack instead of overflowing; relevant inputs go full-width on mobile.
- Interactive controls (buttons, upload labels) get `min-height: 40px` on mobile.

### 4. Mobile nav (`globals.css`)

Remove the `@media (max-width: 760px) { .nav-links > a:not(.btn) { display:none } }`
rule. Instead let `.nav-links` `flex-wrap: wrap` and shrink gap/font at small
widths so `Browse` + `Dashboard` + auth stay visible and tappable. No hamburger.

## Out of scope

- Collapsible/accordion sections (adds JS or changes desktop defaults).
- Any color/brand redesign, typography overhaul, or new components.
- Backend, API, or data-shape changes.

## Verification

- `next build` / typecheck passes (JSX edits are structural only).
- Manual check at 375px, 640px, and desktop widths: nav links visible & tappable;
  stats render 2×2 on phone; activity reflows to labeled cards; Songs & Payouts
  cards are styled and match the brand; no horizontal overflow.
