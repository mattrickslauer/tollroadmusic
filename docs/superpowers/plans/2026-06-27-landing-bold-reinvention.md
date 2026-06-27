# Landing Bold Reinvention — Implementation Plan

> **For agentic workers:** Foundation task runs first and alone. Tasks 1–5 are
> INDEPENDENT and run in PARALLEL (separate component + module files). A
> cohesion review + verify runs last.

**Goal:** Reinvent the 5 consumer landing sections with a bold "Night Drive"
identity, punchy voice, editorial-dense layout, and corrected honest-cut
messaging — without touching the infra/dev sections.

**Architecture:** One sequential Foundation task establishes shared tokens, a
shared animation/util stylesheet, and a written art-direction brief. Then five
section agents each rewrite ONE component + a co-located CSS Module, consuming
the shared tokens and following the brief. CSS Modules give per-section
isolation so parallel work never collides.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS custom-property tokens +
CSS Modules (new for these sections). Frontend lives in `frontend/`.

## Global Constraints (bind every task)

- **Honest-cut messaging (binding):** NEVER say "no middleman", "we take
  nothing", "straight to the music", "paid in full", or imply a zero cut.
  TollRoad takes ONE honest, transparent, openly-stated cut; EVERYTHING ELSE
  goes directly to the artist. Differentiator = transparency + direct-to-artist
  + per-minute metering. Copy violating this is a defect.
- **Consumer sections only:** edit only `Hero`, `MiddlemanFlow`, `Outcomes`,
  `MeteredSteps`, `Closer`. Do NOT edit `DevStrip`, `Infrastructure`, or
  `app/(marketing)/developers/*`.
- **Do NOT modify existing GLOBAL selectors** in `app/globals.css` (e.g.
  `.section`, `.hero`, `.sec-head`, `.chips`, `.chip`, `.flow`, `.outcomes`,
  `.closer`) — the infra sections share them. Build the new look in CSS Modules
  with new class names. You MAY keep using the `.wrap` max-width container.
- **New tokens are ADDITIVE.** Do not change any existing token value
  (`--amber`, `--asphalt-*`, `--bone*`, `--line*`, fonts). Add only new `--nd-*`
  tokens.
- Preserve all routes/anchors/CTAs: `#flow`, `#outcomes`, `#start`,
  `ROUTES.browse` (`/browse`), `ROUTES.signup` (`/artist/join`), and the Hero's
  three CTAs (Listen now / Sign up / See how).
- All new motion must respect `prefers-reduced-motion: reduce` (no essential
  info conveyed only by motion).
- No new npm dependencies. No new web-font package — reuse already-loaded
  families (add a heavier WEIGHT to the existing `next/font` config only if a
  needed weight is missing; that is not a new dependency).
- Each component stays a React Server Component UNLESS it needs browser APIs;
  reuse the existing client `Reveal` wrapper for scroll-reveal. A live ticking
  meter / marquee may use CSS animation (no JS) to stay an RSC where possible.
- Verification is build-based (no React component test harness): each task runs
  `npm run build` + `npm run lint` from `frontend/` and both must pass.
- Commit after each task; end messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Shared tokens (Foundation authors these EXACT values)

Add to `frontend/styles/tokens.css` `:root` (additive):

```css
/* Night Drive — bold consumer-section identity (additive) */
--nd-bg: #0a0a0f;
--nd-bg-2: #0e0e18;
--nd-bg-3: #15152499;       /* translucent card over bg */
--nd-line: rgba(255,255,255,0.10);
--nd-line-2: rgba(255,255,255,0.18);
--nd-ink: #f4f4fb;
--nd-ink-dim: #a8a8c6;
--nd-ink-faint: #70708e;
--nd-amber: #ffc24b;        /* electric gold — energy/headlines */
--nd-amber-deep: #e09a16;
--nd-lime: #c6ff4a;         /* acid lime — earned / artist money */
--nd-lime-deep: #97d800;
--nd-blue: #5ad7ff;         /* electric blue — data / labels */
--nd-amber-glow: rgba(255,194,75,0.22);
--nd-lime-glow: rgba(198,255,74,0.20);
--nd-blue-glow: rgba(90,215,255,0.16);
--nd-display: clamp(2.8rem, 7vw, 6.6rem);   /* oversized headlines */
--nd-h2: clamp(2rem, 5vw, 4.1rem);
--nd-stat: clamp(3rem, 9vw, 8rem);          /* big number graphics */
--nd-ease: cubic-bezier(0.22, 1, 0.36, 1);
```

Type usage: oversized headlines = `--font-display` (Fraunces) at `--nd-display`
with tight leading (~0.95) and tight tracking; punchy eyebrows/labels/data =
`--font-mono` uppercase; editorial pull-quotes = Fraunces *italic*. Verify the
Fraunces/Manrope weights used are loaded by the existing `next/font` setup; add
a missing weight to that config if needed.

---

### Task 0 — Foundation (SEQUENTIAL, run first and alone)

**Files:**
- Modify: `frontend/styles/tokens.css` (append the `--nd-*` tokens above)
- Create: `frontend/styles/landing.css` (shared keyframes + util: `nd-marquee`
  ticker animation, a subtle `nd-meter-pulse`, lane-marking background helper;
  ALL wrapped so `@media (prefers-reduced-motion: reduce)` disables motion)
- Modify: `frontend/app/(marketing)/layout.tsx` to import `@/styles/landing.css`
  (global import is allowed here; it only adds keyframes/util classes, no
  overrides of existing selectors)
- Create: `frontend/docs/art-direction-brief.md` — the shared brief (palette hex
  table, type scale + usage, spacing rhythm, motif catalogue with class/anim
  names, the punchy voice guide with 4–6 example lines, and the honest-cut copy
  rules). This is the single source of cohesion every section agent reads.
- Confirm `next/font` weights; if a heavier weight is needed, add it to the
  existing font config (no new package).

**Steps:**
- [ ] Append `--nd-*` tokens to `tokens.css`.
- [ ] Create `styles/landing.css` with shared keyframes/utilities + reduced-motion guard.
- [ ] Import `styles/landing.css` in the marketing layout.
- [ ] Verify/adjust font weights in the existing `next/font` config.
- [ ] Write `docs/art-direction-brief.md` (concrete hex, type, motifs, voice, honest-cut rules).
- [ ] `npm run build && npm run lint` → both pass.
- [ ] Commit: `feat(landing): night-drive foundation tokens + shared motion + brief`.

**Produces (consumed by Tasks 1–5):** the `--nd-*` tokens, the
`styles/landing.css` animation/util class + keyframe names, and
`docs/art-direction-brief.md`.

---

### Tasks 1–5 — Section rewrites (PARALLEL; each independent)

Each task: rewrite ONE component to the Night Drive identity + editorial-dense
layout + punchy honest-cut copy, with all new styles in a co-located CSS Module
(`ComponentName.module.css`) that references the `--nd-*` tokens and the
`landing.css` animations. Reuse `Reveal` for scroll-in. Keep the section's `id`
and all CTAs/routes. Do not touch global selectors or other sections' files.
Each ends with `npm run build && npm run lint` passing and a commit.

- **Task 1 — Hero** (`components/Hero.tsx` + `Hero.module.css`)
  Beats: oversized headline pairing per-minute pricing with "artists keep the
  rest"; subhead states the honest, out-loud cut + everything-else-direct; KEEP
  the three CTAs (Listen now → `/browse`, Sign up, See how) and the live
  `Meter`; add the marquee ticker motif. Eyebrow punchy mono.
  Commit: `feat(landing): reinvent Hero — night drive, honest-cut`.

- **Task 2 — MiddlemanFlow → "The Honest Cut"** (`components/MiddlemanFlow.tsx`
  + `MiddlemanFlow.module.css`)
  Beats: headline like "One cut. Out loud. The rest is theirs." New flow row:
  **You → TollRoad (our cut, shown openly) → Artist (everything else, direct)**,
  contrasted with old way (you → opaque platform + pool → artist: pennies). The
  TollRoad node MUST display our cut transparently (never zero/hidden). Keep
  `id="flow"`. Editorial-dense supporting copy + captions.
  Commit: `feat(landing): reinvent honest-cut flow section`.

- **Task 3 — Outcomes** (`components/Outcomes.tsx` + `Outcomes.module.css`)
  Beats: denser listener-vs-artist panels with big stat callouts, pull-quote,
  captions; keep ~$8 metered vs $11.99 flat comparison; bolder punchy copy. Do
  not invent unverifiable new numbers. Keep `id="outcomes"`.
  Commit: `feat(landing): reinvent Outcomes — editorial-dense panels`.

- **Task 4 — MeteredSteps** (`components/MeteredSteps.tsx` + `MeteredSteps.module.css`)
  Beats: punchier three-step utility framing with more detail per step + big
  numbers/meter motif; reuse existing `Icons`.
  Commit: `feat(landing): reinvent MeteredSteps — bold metered utility`.

- **Task 5 — Closer** (`components/Closer.tsx` + `Closer.module.css`)
  Beats: oversized bold finish; KEEP both CTAs (listener → `/browse`, artist →
  `/artist/join`) and `id="start"`. Optional honest-cut one-liner reprise.
  Commit: `feat(landing): reinvent Closer — oversized finish`.

---

### Task 6 — Cohesion review + verification (after 1–5)

- [ ] Cohesion review across all 5 modules: shared palette/type/motif usage,
      no global-selector edits, honest-cut rule satisfied everywhere, infra
      sections untouched.
- [ ] `npm run build && npm run lint` pass; `/developers` + infra still build.
- [ ] Serve and curl `/`: confirm new copy present, NO banned phrases ("no
      middleman", "paid in full", "straight to the music", "we take nothing"),
      all CTAs/anchors intact, consumer story leads.
- [ ] Fix any findings, re-verify.

## Self-Review

- Spec coverage: identity (Task 0 tokens/brief), per-section reinvention +
  honest-cut (Tasks 1–5), cohesion + banned-phrase check (Task 6). ✓
- Parallelism safety: CSS Modules + per-section files → no shared-file
  contention; only Task 0 touches shared files, and it runs first/alone. ✓
- Honest-cut rule is a Global Constraint + per-section beat + a Task 6
  banned-phrase grep. ✓
- Routes/anchors/CTAs preserved as explicit constraints. ✓
