# Landing page: consumer-first + light infrastructure layer

**Date:** 2026-06-27
**Status:** Approved (design), ready for implementation plan

## Goal

Keep the TollRoad marketing landing page consumer-first while layering in the
two newer capabilities — the **agentic MCP DJ** and an **online (web) listener**
— and a light **infrastructure / plug-and-play** accent. Consumers remain the
main target; the platform story is sprinkled in, not dominant (~25% of page).

## Principles

- Do not disturb the existing warm marketing brand or the five existing
  consumer sections. They stay as-is.
- Everything new reuses existing primitives: `Reveal`, `Cta`, `SignupCta`,
  `.section`/`.wrap`/`.lane` classes, and the design tokens in
  `styles/tokens.css` / `app/globals.css`.
- Marketing CSS uses the existing **no-prefix** convention (semantic selectors
  like `.hero`, `.flow`), not the `.lx-` listen-app prefix.
- YAGNI: this is copy + layout + one stub page. No functional embed widget, no
  SDK, no public docs site, no backend changes.

## Page structure

Current sections (`frontend/app/(marketing)/page.tsx`):
`Hero → MiddlemanFlow → Outcomes → MeteredSteps → Closer`

New structure (changes in **bold**):

1. **`Hero`** — add a third CTA **"Listen now →"** → `/browse` (ROUTES.browse).
   This is the online-listener consumer hook: listen in the browser, no app, no
   install. Eyebrow + headline stay consumer ("Consumers pay less. Artists get
   paid more.").
2. `MiddlemanFlow` — unchanged.
3. `Outcomes` — unchanged.
4. `MeteredSteps` — unchanged.
5. **`DevStrip` (NEW — light touch #1)** — a slim, single-line woven strip:
   *"Building something? TollRoad is the metered-music layer — drop in a player
   or let an agent DJ."* with one accent link **"For developers & agents →"** →
   `/developers`. Minimal height; reads as an aside, not a pillar.
6. **`Infrastructure` (NEW — light touch #2)** — section, id `#infra`, titled
   *"Any app, any agent"* / *"Built as infrastructure."* Three cards:
   - **Agentic MCP DJ** — "An AI agent describes a vibe, pays by the minute, and
     the music plays. The agent doesn't have a login — it has a wallet."
   - **Embeddable player** — "Drop the metered player into your own site or app —
     instant browser listening, no install."
   - **Metered by the minute** — "One API, paid per second of use. Real creators,
     direct-licensed."
   Section CTA: **"For developers & agents →"** → `/developers`.
7. `Closer` — unchanged (no new CTA required; the dev path is already covered by
   DevStrip + Infrastructure).

## New `/developers` stub page

Route: `frontend/app/(marketing)/developers/page.tsx` (lives in the marketing
group so it inherits `SiteNav` + `SiteFooter` and the warm brand).

Contents (static, no live functionality):
- Hero: *"The metered-music layer for apps and agents."*
- Short value lines mirroring the three Infrastructure cards.
- A read-only code snippet block showing the MCP server name
  (`tollroad-vibe-dj`) and the core tool loop
  (`search_music → start_session → get_stream → 402 → charge → stream`),
  styled with `--font-mono`.
- A "Get in touch" CTA → `mailto:` (placeholder address, e.g. the founder
  email) since there is no signup/docs backend yet.

## Routes

Add to `frontend/lib/routes.ts`:
- `ROUTES.browse` already exists → used by Hero "Listen now".
- `ROUTES.developers = "/developers"` (new).

## Styling

- New CSS appended to `app/globals.css` (or the relevant marketing stylesheet),
  following existing patterns. New selectors: `.dev-strip`, `.infra`,
  `.infra-grid`, `.infra-card`, and `/developers` page selectors. Reuse token
  variables for color/spacing/typography. No new fonts or tokens.
- Cards reuse the visual language of `MeteredSteps` chip cards where practical.

## Components (new files)

- `frontend/components/DevStrip.tsx`
- `frontend/components/Infrastructure.tsx`
- `frontend/app/(marketing)/developers/page.tsx`

Edits:
- `frontend/components/Hero.tsx` — add "Listen now" CTA.
- `frontend/app/(marketing)/page.tsx` — insert `DevStrip` + `Infrastructure`.
- `frontend/lib/routes.ts` — add `developers`.
- `app/globals.css` — new section styles.

## Out of scope

- Any working embed widget or copy-paste SDK.
- A real developer docs site or API key signup.
- Backend / MCP changes.
- Changes to the listen app (`(listen)` group) or artist flows.

## Success criteria

- Page still leads with the consumer value prop; new B2B content is clearly
  secondary (~25% of vertical space, below the consumer sections).
- Hero offers an immediate "Listen now" path to the web player.
- The agentic MCP DJ and embeddable-player stories are present and on-brand.
- `/developers` renders within the marketing chrome with no dead links
  (mailto + working internal links only).
- No regression to existing sections; build passes.
