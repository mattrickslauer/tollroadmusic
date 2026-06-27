# Landing page bold reinvention — consumer sections

**Date:** 2026-06-27
**Status:** Approved (design), ready for implementation plan
**Scope:** The 5 consumer marketing sections ONLY — `Hero`, `MiddlemanFlow`,
`Outcomes`, `MeteredSteps`, `Closer`. The infra/dev sections (`DevStrip`,
`Infrastructure`, `/developers`) are intentionally left as-is for a later pass;
a temporary visual mismatch between consumer and infra sections is accepted.

## Goal

Reinvent the look and copy of the consumer landing sections: a **bold, modern,
fun** visual identity; **bold & punchy** voice; **editorial-dense** (magazine
spread) layout with 2–3× the current copy; and corrected **honest-cut**
messaging. Replace the current minimal/airy treatment.

## Messaging correction (binding — applies to ALL sections)

TollRoad **takes a cut — that is the business model.** Do NOT claim "no
middleman", "we take nothing", "straight to the music", or "paid in full"
anywhere. The honest, on-brand framing:

- TollRoad takes **one honest, transparent, openly-stated cut.**
- **Everything else goes directly to the artist** (no opaque pool, no hidden
  intermediaries skimming the rest).
- Differentiator = transparency + direct-to-artist + per-minute metering — NOT
  a zero cut.

Any copy that contradicts this is a defect.

## Visual identity — "Night Drive / Neon Tollbooth"

A bold reinvention of the EXISTING token system's mood (we are not adopting a
separate framework). New/extended design tokens, scoped to the consumer
sections:

- **Palette:** deeper, cooler near-black base (e.g. `#0a0a0f` with a faint
  indigo cast) replacing the warm asphalt feel for these sections. Dual neon
  accent: an electric **amber/gold** (energy/headlines) + an **acid-lime**
  "earned/paid" green (money-to-artist moments) + a cool **electric-blue**
  tertiary for data/labels. High-contrast neon-on-black.
- **Type:** much larger, tighter editorial headlines; oversized display
  numbers used as graphic elements. Keep `Fraunces` for italic editorial
  accents / pull-quotes; keep `JetBrains Mono` for live meter + data; punchy
  heavy weight for the big display lines. No new web-font dependency unless a
  weight already loaded covers it — prefer reusing loaded families at heavier
  weights/sizes over adding fonts.
- **Recurring motifs (fun + motion):** a live ticking **per-minute meter**, a
  scrolling **marquee ticker**, toll-lane markings, coin-flow and equalizer
  (the latter two already exist — pushed harder). Motion must respect
  `prefers-reduced-motion`.

## Layout language — editorial-dense

Magazine grid: multi-column blocks, big stat callouts, pull-quotes, captions,
chips/badges carrying numbers. Each section carries materially more copy than
today, art-directed (not cluttered). Must remain responsive (single-column on
narrow viewports) and keep the consumer story leading the page.

## Per-section requirements

Exact final copy is authored during implementation against the shared brief;
these are the required beats and the corrected messaging.

1. **Hero** — punchy headline pairing pay-by-minute with artists keeping the
   rest, e.g. *"Pay by the minute. Artists keep the rest."* Subhead states the
   honest cut explicitly (*"We take one honest, out-loud cut — every other cent
   meters straight to the artist."*). Keep the existing three CTAs (Listen now
   → `/browse`, Sign up, See how) and the live meter; add the marquee ticker.
   Do NOT remove or break the existing CTAs/routes.
2. **MiddlemanFlow → "The Honest Cut"** — headline like *"One cut. Out loud.
   The rest is theirs."* New flow: **You → TollRoad (our cut, shown openly) →
   Artist (everything else, direct)**, contrasted with the old way (you →
   opaque platform + pool → artist gets pennies). The TollRoad node must show
   our cut transparently, NOT hide or zero it. Keep section `id="flow"`.
3. **Outcomes** — denser listener-vs-artist with real stat callouts and bolder
   copy. Keep section `id="outcomes"`. Keep the ~$8 metered vs $11.99 flat
   comparison; do not invent unverifiable numbers beyond what exists today.
4. **MeteredSteps** — punchier, more detail per step, big numbers; keep the
   three-step utility framing.
5. **Closer** — oversized bold finish; keep the two CTAs (listener → `/browse`,
   artist → `/artist/join`) and `id="start"`.

## Architecture for parallel implementation

Cohesion across 5 independently-built sections is the main risk; it is managed
by a single shared foundation plus a written art-direction brief.

1. **Foundation (sequential, one step):**
   - Add the new/extended tokens (palette, type scale, motif variables) to the
     token layer (`styles/tokens.css` or a new imported `styles/landing.css`
     `:root` block). Existing tokens stay; new ones are additive so infra
     sections are unaffected.
   - Decide and set up the **per-section style isolation mechanism** so 5
     agents never edit the same stylesheet. Recommended: **CSS Modules**
     (`SectionName.module.css` co-located with each component, imported by that
     component) referencing the shared global CSS-variable tokens. This is
     Next.js-idiomatic and removes all shared-file contention. (Alternative:
     pre-created per-section global CSS files with unique class prefixes, wired
     once in the foundation step.)
   - Write a shared **art-direction brief** file (palette hex values, type
     scale, spacing rhythm, motif usage, the punchy voice guide, and the
     honest-cut copy rules) that every section agent reads. This file is the
     single source of cohesion.
2. **Parallel section work (5 agents):** each rewrites ONE section's component
   `.tsx` + its co-located module CSS, consuming shared tokens and following
   the brief. Independent files → safe parallelism.
3. **Review + verify:** per-section review for spec compliance (esp. the
   honest-cut rule) + a cohesion review across all five, then `npm run build` +
   `lint` + a served render check of `/`.

## Constraints

- Consumer sections only; do NOT restyle `DevStrip`, `Infrastructure`, or
  `/developers`.
- New tokens are ADDITIVE — do not change existing token values that the infra
  sections depend on (`--amber`, `--asphalt-*`, `--bone*`, `--line*`, etc.).
- No backend changes. No new npm dependencies unless unavoidable (a heavy font
  weight already loaded is preferred over a new font package).
- Preserve all existing routes/anchors and CTA destinations
  (`#flow`, `#outcomes`, `#start`, `/browse`, `/artist/join`).
- Respect `prefers-reduced-motion` for all new animation.
- Verification is build-based (no React component test harness): `npm run
  build` + `npm run lint` + served render check.

## Out of scope

- Infra/dev section restyling (later pass).
- Backend, pricing, or data changes.
- New fonts/dependencies beyond what's already loaded (preferred).

## Success criteria

- The 5 consumer sections look boldly modern, fun, and editorial-dense, clearly
  distinct from the prior minimal treatment, and cohesive with each other.
- NO "no middleman / zero cut / paid in full" language anywhere; honest-cut
  framing present and consistent.
- All existing CTAs, routes, and anchors still work; the page builds and
  renders; consumer story still leads.
