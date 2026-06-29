# TollRoad Demo — Overlay PNGs

49 transparent **1920×1080 PNG** overlays for the 3-minute demo, ready to drop on a Resolve timeline.
Companion to the written `../2026-06-29-overlay-library.md` and the shooting script `../2026-06-27-vibe-dj-demo-script.md`.

- **Cards:** `png/*.png` — alpha PNGs, named by `ID-category-slug`.
- **Contact sheet:** `contact-sheet.png` — every card at a glance (rendered on a dark field; the cards themselves are transparent).
- **Source:** `build.py` defines every card; `render.sh` regenerates the PNGs (headless chromium). Edit the text/colors in `build.py` and re-run `./render.sh`.

## Two kinds of overlay

| Kind | Files | Background | How to use |
|------|-------|-----------|------------|
| **On-footage** | lower-thirds (A), term callouts (C), dual-captions (D), code receipts (H) | transparent panel | drop straight over your talking-head clip |
| **Full-frame punch-in** | stat cards (B), title cards (J), pull-quotes (K), end card (J4) | transparent + dark scrim | the scrim dims the footage so the text reads — use as a brief punch-in *over* footage, or cut to it full-screen |

## Using in DaVinci Resolve

1. Drag the `png/` folder into the Media Pool.
2. Drop a card on a video track **above** your talking-head clip (PNG alpha composites automatically — no key needed).
3. Trim to ~2–3s. Add a Fade In/Fade Out (or a Cross Dissolve) on each end; these are static cards, so the dissolve *is* the animation.
4. Lower-thirds/term/code cards are pre-positioned in the title-safe area — leave them at default transform.

## File index

### A — Lower-thirds
- `A1-lower-amanda` — **AMANDA KURT** / *Independent artist*
- `A2-lower-founder` — **[YOUR NAME]** / *Built TollRoad · solo · 17 days*  ← edit your name in `build.py`
- `A3-lower-role` — **[YOUR NAME]** / *Looking for: Solutions Architect, AWS*

### B — Stat cards (punch-in)
- `B1-stat-2mo` — **~$2/mo** · the entire bill at demo traffic
- `B2-stat-peruser` — **$0.085** · per user
- `B3-stat-writes` — **16–23K** writes/sec · *labeled "built for / design target"*
- `B4-stat-streams` — **1,000,000** concurrent streams · *design target*
- `B5-stat-key` — **~150s** · the key expires
- `B6-stat-price` — **$0.000 – $1.00** · the artist sets it
- `B7-stat-zero` — **$0** · idle cost. by design.

> ⚠️ B3/B4 say "built for / design target" on purpose — matches the script's real-vs-illustrated receipts. Don't relabel them as current load.

### C — Term callouts
- `C1-term-cqrs` POLYGLOT CQRS · `C2-term-millicents` MILLICENTS · `C3-term-ledger` APPEND-ONLY LEDGER
- `C4-term-x402` x402 · `C5-term-scalezero` SCALE-TO-ZERO · `C6-term-ssekms` SSE-KMS

### D — Dual-caption pairs (🔧 flex + 🎧 plain)
- `D1-dual-atomic` · `D2-dual-vibe` · `D3-dual-mcp` · `D4-dual-encryption` · `D5-dual-stripe`

### H — Code receipt cards
- `H1-code-debit` — the conditional debit · `H2-code-idempotency` — the idempotency key
- `H3-code-402` — `402 Payment Required` · `H4-code-footnote` — the receipts strip

### J — Title / end cards (punch-in)
- `J1-title-metered` 01 · `J2-title-twodb` 02 · `J3-title-cool` 03 · `J4-endcard` TollRoad

### K — Pull-quotes (punch-in)
- `K1-quote-billing` · `K2-quote-stripe` · `K3-quote-amanda` · `K4-quote-idle`

### E — Architecture diagrams (full-frame, punch-in)
Stylized static diagrams of the real system. Cut to them full-screen, or float at ~80% over footage.
- `E1-arch-twolanes` — polyglot CQRS: WRITES→DynamoDB | READS→Aurora DSQL
- `E2-arch-atomic` — charge + log play snap into one atomic write
- `E3-arch-ledger` — play → append-only `royalty_ledger` → pre-totalled dashboard
- `E4-arch-encryption` — track padlock (AES-256) + key-on-payment (~150s) → playing
- `E5-arch-cqrs-pipeline` — DynamoDB → Streams → Projector λ → Aurora DSQL (the seam)
- `E6-arch-x402` — the 402 → pay → 200+signed-URL agent handshake
- `E7-arch-vibe` — "describe a feeling" → Bedrock embedding → vector match inside DynamoDB

### M — App-styled meter overlays (on-footage UI)
Faithful recreations of the real TollRoad UI — same tokens (amber `#ffb02e`, metering-green
`#66e6a6`, asphalt `#08080a`) and fonts (JetBrains Mono numbers, Fraunces gold balance, Manrope body).
Transparent around the card; drop straight over footage like a PIP.
- `M1-meter-tick-low` / `M2-meter-tick-mid` / `M3-meter-tick-high` — the taximeter at rising values
  (sequence them — low→mid→high — for a fake "ticking up" without real animation)
- `M4-meter-paused` — same card, PAUSED state (for "stop listening → stop paying")
- `M5-wallet-balance` — the gold Fraunces wallet balance card
- `M6-player-chip` — the in-player balance + session meter chip
- `M7-artist-earnings` — artist earnings card, green total + per-track ledger rows
- `M8-rate-chip` — the `0.5¢/min` rate chip (green)
- `M9-player-bar` — the full docked now-playing bar (anchor to frame bottom — it's already full-width)

> Tip: `M1→M2→M3` cross-dissolved over ~6s reads as a live meter climbing. `M9` sits at the very bottom
> of frame exactly like the app's player. `M5`/`M7` are corner cards.

## Not included (need motion / your own capture)
- **F — live-app insets** → your own screen captures of the shipped UI (don't capture streaks/leaderboards — not shipped).
- True frame-by-frame **animation** of the meter ticking → the M1–M3 sequence fakes it; for real motion, build in Resolve Fusion / After Effects.

Ask and the E diagrams or M meters can be produced as animated Lottie/Fusion comps next.

## Regenerate
```bash
cd docs/demo/overlays && ./render.sh
```
Requires `python3` + `chromium-browser`. The meter cards (M*) use the app's real fonts in `fonts/`
(JetBrains Mono + Manrope, committed; Fraunces is system-installed). To change wording, accent color,
names, meter values, etc., edit `build.py` and re-run.
