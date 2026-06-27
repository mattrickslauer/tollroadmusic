# Art-Direction Brief — Night Drive Consumer Sections

> **READ THIS FIRST.** This brief is the single source of cohesion for all five
> parallel section rewrites (Hero, MiddlemanFlow, Outcomes, MeteredSteps, Closer).
> Follow every rule here; the cohesion review will grep for violations.

---

## Palette — hex table + token map + when to use

| Role | Hex | CSS token | When to use |
|---|---|---|---|
| Base background | `#0a0a0f` | `--nd-bg` | Section backgrounds; the deepest layer |
| Elevated background | `#0e0e18` | `--nd-bg-2` | Cards, panels, raised surfaces |
| Translucent card | `#15152499` | `--nd-bg-3` | Overlaid cards, glassmorphism panels |
| Subtle border | `rgba(255,255,255,0.10)` | `--nd-line` | Dividers, thin outlines, grid lines |
| Active border | `rgba(255,255,255,0.18)` | `--nd-line-2` | Focused/hovered borders, captions separators |
| Primary ink | `#f4f4fb` | `--nd-ink` | All body copy, headings on dark bg |
| Dimmed ink | `#a8a8c6` | `--nd-ink-dim` | Captions, secondary labels, metadata |
| Faint ink | `#70708e` | `--nd-ink-faint` | Placeholder, disabled, footnote |
| **Electric amber** | `#ffc24b` | `--nd-amber` | **Energy, headlines, CTAs, hero accents** |
| Amber deep | `#e09a16` | `--nd-amber-deep` | Amber hover states, filled amber buttons |
| **Acid lime** | `#c6ff4a` | `--nd-lime` | **Earned money, artist revenue moments, positive stats** |
| Lime deep | `#97d800` | `--nd-lime-deep` | Lime hover, filled lime elements |
| **Electric blue** | `#5ad7ff` | `--nd-blue` | **Data labels, per-minute meter readings, technical details** |
| Amber glow | `rgba(255,194,75,0.22)` | `--nd-amber-glow` | Box-shadow/text-shadow behind amber elements |
| Lime glow | `rgba(198,255,74,0.20)` | `--nd-lime-glow` | Glow behind lime elements (meter pulse) |
| Blue glow | `rgba(90,215,255,0.16)` | `--nd-blue-glow` | Glow behind data/label elements |

### Colour rules

- **Amber = energy and action.** Use for oversized display headlines, the primary CTA
  button, the hero eyebrow. It signals electricity, movement, the toll.
- **Lime = earned / artist money.** Reserve lime for any stat or copy moment that says
  "this goes to the artist" — the per-minute payout, revenue numbers, the artist-side
  flow node. Lime on `--nd-bg` reads like a neon sign.
- **Blue = data and labelling.** Use for the live meter counter text, data captions,
  technical labels like "per minute played", badge text. Cool precision.
- Never mix all three on the same text line. One accent per element.
- Glow tokens go on `box-shadow` or `text-shadow` — never as backgrounds.

---

## Type scale + usage

All three font families are loaded as variable fonts in `app/layout.tsx` and are
available at **all weights** without any additional config.

| Variable | Font | Style | Weight | Token |
|---|---|---|---|---|
| Display / oversized headline | Fraunces | normal | 700–900 | `--font-display` |
| Pull-quote / editorial accent | Fraunces | *italic* | 400–600 | `--font-display` |
| Body / UI copy | Manrope | normal | 400–800 | `--font-body` |
| Eyebrow / data / mono | JetBrains Mono | normal | 400–700 | `--font-mono` |

### Sizes (use the `--nd-*` custom properties)

| Token | Value | Use for |
|---|---|---|
| `--nd-display` | `clamp(2.8rem, 7vw, 6.6rem)` | Section headings h1/h2 |
| `--nd-h2` | `clamp(2rem, 5vw, 4.1rem)` | Sub-headings, panel headings |
| `--nd-stat` | `clamp(3rem, 9vw, 8rem)` | Big graphic numbers ($8, 92%, etc.) |

### Usage rules

1. **Oversized display headlines** — `font-family: var(--font-display)`, size
   `--nd-display`, weight 800–900, `line-height: 0.95`, `letter-spacing: -0.02em`,
   colour `--nd-ink` or `--nd-amber`. Tight. Dense. No loose leading.
2. **Eyebrows** (the punchy label above a headline) — `font-family: var(--font-mono)`,
   `font-size: 0.7rem`–`0.8rem`, `text-transform: uppercase`, `letter-spacing: 0.12em`,
   colour `--nd-amber` or `--nd-blue`. One line only.
3. **Editorial pull-quotes** — `font-family: var(--font-display)`, `font-style: italic`,
   weight 500, `font-size: clamp(1.35rem, 3vw, 2.4rem)`, colour `--nd-ink-dim`.
4. **Body copy** — `font-family: var(--font-body)`, weight 400–500, `font-size: 1rem`–
   `1.15rem`, `line-height: 1.6`. Colour `--nd-ink` for primary, `--nd-ink-dim` for
   secondary/caption.
5. **Data / live meter** — `font-family: var(--font-mono)`, weight 600–700, colour
   `--nd-blue` for labels and `--nd-lime` for live earned values.
6. **Big stat callouts** — `font-family: var(--font-display)`, size `--nd-stat`,
   weight 900, colour `--nd-lime` (earned) or `--nd-amber` (energy). No padding.
   Let them bleed into the layout as graphic elements.

---

## Spacing + rhythm — editorial-dense magazine layout

The goal is a magazine spread: dense with information, art-directed, NOT cluttered.
More copy than the current minimal treatment, but every word earns its place.

### Grid

- Max-width: use the existing `.wrap` container (`--maxw: 1180px`).
- Multi-column within sections: CSS Grid with `repeat(12, 1fr)` or `auto-fit` minmax
  columns. Two or three editorial columns of copy is normal for these sections.
- Big stat numbers span full columns or bleed to edge as graphic interrupts.
- Pull-quotes can span the full width or sit in a 7-column offset.

### Vertical rhythm

- Section top/bottom padding: `clamp(5rem, 10vw, 9rem)` — generous but not airy.
- Between sub-elements inside a section: `clamp(2rem, 4vw, 3.5rem)`.
- Between a label/eyebrow and its headline: `0.5rem`.
- Between a headline and its body copy: `clamp(1rem, 2vw, 1.5rem)`.
- Caption / footnote below a stat: `0.4rem`, dimmed ink, small mono type.

### Density

- Target 2–3× the current copy per section — more sub-bullets, more captions,
  more pull-quotes. Each section should feel like a magazine article spread, not
  a landing-page billboard.
- Every section has: an eyebrow label, an oversized headline, at least one
  pull-quote or stat callout, and dense supporting copy. Some sections have
  two-column body + a stat panel.

### Borders + texture

- Section-to-section transitions: use a 1px `--nd-line` border or a gradient fade.
  Never hard cuts between sections of different bg.
- `.nd-lane-bg` or `.nd-lane-dash` can underscore section eyebrows or hero areas.
- Card/panel borders: `1px solid var(--nd-line)`, `border-radius: var(--r-lg)`.

---

## Motif catalogue — landing.css classes and keyframes

All animation classes live in `frontend/styles/landing.css`. Import it in your
CSS Module only if you need a reference — the layout already imports it globally
so the keyframes and util classes are always available.

### Classes

| Class | What it does | How to use |
|---|---|---|
| `.nd-marquee-wrap` | Outer clip container for the ticker | Set on the overflow wrapper element |
| `.nd-marquee-track` | The scrolling inner strip | Put duplicate content (×2) inside; set `--nd-marquee-duration` CSS var (default `28s`) |
| `.nd-meter-pulse` | Lime glow pulse at 2s cadence | Add to a live meter counter, a dot, or a lime badge |
| `.nd-amber-pulse` | Amber glow pulse at 2.4s cadence | Add to a CTA or amber-accent element for subtle energy |
| `.nd-lane-bg` | Subtle vertical lane-stripe pattern | Add to a section wrapper or background layer |
| `.nd-lane-dash` | Horizontal amber dashed centre-line | Use as a section divider bar or under an eyebrow |
| `.nd-fade-up` | One-shot fade+slide up on mount | Add to staggered elements; set `--nd-fade-delay` (e.g. `0.15s`) per child |

### Keyframes (if you need to reference them in a CSS Module animation)

| Name | Motion |
|---|---|
| `nd-marquee-scroll` | Horizontal marquee scroll (translateX 0 → -50%) |
| `nd-meter-pulse-kf` | Opacity + lime box-shadow pulse |
| `nd-amber-pulse-kf` | Opacity + amber box-shadow pulse |
| `nd-fade-up-kf` | Fade + translateY(24px → 0) |

### Reduced-motion

All motion is gated inside `@media (prefers-reduced-motion: no-preference)`.
When `reduce` is preferred, animations are `none` and elements are still fully
visible. You must NOT add any `prefers-reduced-motion: reduce` hacks that HIDE
content — only disable motion. This is already handled by `landing.css`.

---

## Voice guide — "bold & punchy"

The brand voice for these sections is **direct, irreverent, confident**. Short
sentences. No corporate hedging. Speaks to listeners as smart adults and to
artists as peers, not supplicants. Magazine-editorial energy.

### 5 example headline / subhead lines

These illustrate tone. Adapt freely; do not copy-paste verbatim unless perfect.

1. **Headline:** "Pay by the minute. Artists keep the rest."
   **Subhead:** "We take one honest, out-loud cut — every other cent meters straight to the artist."

2. **Headline:** "One cut. Out loud. The rest is theirs."
   **Subhead:** "No opaque pool. No hidden skimming. You know exactly what you're paying and exactly where it goes."

3. **Headline:** "Streaming priced like electricity."
   **Subhead:** "Spin the meter. Walk away. Pay only for what you actually heard."

4. **Headline:** "Finally — artists paid per minute you actually stayed."
   **Subhead:** "Not per stream. Not per skip. Per minute played. Metered like a utility, transparent like it should be."

5. **Headline:** "The toll is one. The rest? Theirs."
   **Subhead:** "We collect one transparent cut. Everything left transfers directly to the artist — no pool, no mystery."

6. **Eyebrow + headline pairing:** `NIGHT DRIVE · PER-MINUTE METERING` / "Music you pay for like a cab ride."

### Voice rules

- **Short.** Headlines under 8 words. Subheads under 25 words. If it's longer, cut.
- **Concrete numbers.** "~$8/mo average" beats "less than your lunch".
- **Active voice.** "Artists earn per minute played" not "per-minute earnings go to artists".
- **No hedging.** Never "we believe", "we hope", "we think". State facts.
- **Pair opposites.** Listener saving ↔ artist earning. Old model (opaque) ↔ new model (transparent). This = TollRoad.
- **No exclamation marks.** Confidence needs no !!.

---

## BINDING honest-cut copy rules

> **These are non-negotiable. Violations are defects caught in Task 6.**

### What TollRoad IS

- TollRoad takes **one honest, transparent, openly-stated cut.**
- **Everything else goes directly to the artist** — no opaque pool, no hidden
  intermediaries skimming between you and the artist.
- The differentiator is: transparency + direct-to-artist transfer + per-minute
  metering. NOT a zero cut.

### Banned phrases — NEVER appear in any consumer copy

| Banned phrase | Why |
|---|---|
| "no middleman" | Implies no cut exists — false. TollRoad IS the middleman, just an honest one. |
| "we take nothing" | False — TollRoad takes a cut. |
| "straight to the music" | Zero-cut implication. |
| "paid in full" | Implies 100% passes through — false. |
| "zero cut" | False. |
| "100% to artists" | False. |
| Any phrase implying TollRoad takes no revenue | False and deceptive. |

### Required framing

Every section that discusses money flow MUST explicitly acknowledge TollRoad's
cut AND frame it as honest/transparent. The MiddlemanFlow section in particular
must show the TollRoad node with our cut visually present and labelled — never
hidden or set to zero.

### The correct contrast

- **Old model:** opaque platform pools → mystery per-stream rates → pennies
- **TollRoad model:** one stated cut (ours) → everything else direct to artist
  → per-minute metering → transparency

The contrast is NOT "we take nothing / they take everything". It is "we are
transparent about our cut / they hide theirs in a pool".

---

*Brief version: 2026-06-27. Authored by Foundation agent (Task 0).
Section agents (Tasks 1–5): consume tokens from `styles/tokens.css --nd-*`,
animation utilities from `styles/landing.css`, and this brief.*
