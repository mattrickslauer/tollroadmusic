# TollRoad Demo — Overlay Library

**Date:** 2026-06-29
**For:** the 3-minute H0 hackathon demo (pairs with `2026-06-27-vibe-dj-demo-script.md`)
**Purpose:** a reusable menu of overlays to layer over founder/Amanda talking-head footage.

Every number and claim here is aligned to the script's "What's real vs. illustrated" receipts — nothing overclaims to the AWS judges. Reuses the 🔧/🎧 dual-caption motif.

**Visual system (apply to all):** dark base, one accent (electric amber = "the meter"), mono font for numbers/code, clean sans for captions. Money ticks up in amber. Keep every overlay ≤ 4s — this is a fast cut.

---

## A. Lower-thirds / speaker tags

| ID | On-screen text | Use | Dur |
|----|----------------|-----|-----|
| **A1 — Amanda tag** | `AMANDA KURT` / *Independent artist* | First time she's on camera (cold open) | 2.5s |
| **A2 — Founder tag** | `[YOUR NAME]` / *Built TollRoad · solo · 17 days* | First founder VO-to-camera | 2.5s |
| **A3 — Role flag** | *Looking for: Solutions Architect, AWS* | Optional, end card only | 2s |

---

## B. Big number / stat cards (full-frame or corner)

Punchy single-number reveals. Number animates up, label fades in under it.

| ID | Big number | Sub-label | Where | Dur |
|----|-----------|-----------|-------|-----|
| **B1** | `~$2/mo` | *entire bill at demo traffic* | Architecture / close | 2.5s |
| **B2** | `$0.085` | *per user — on a platform that moves real money* | "the numbers" beat | 2.5s |
| **B3** | `16–23K` | *writes/sec — built for* (say "built for," not "serving") | DynamoDB beat footnote | 2s |
| **B4** | `1,000,000` | *concurrent streams — design target* | Scale footnote | 2s |
| **B5** | `~150s` | *the key expires* | Encryption beat | 2s |
| **B6** | `$0.000 – $1.00` | *artist sets it · per minute · tenth-of-a-cent steps* | Pricing beat | 2.5s |
| **B7** | `$0` | *idle cost. by design.* | Hard close button | 2s |

> ⚠️ Keep B3/B4 labeled "built for / design target" — the receipts flag this.

---

## C. Term callout cards (define-the-jargon)

Small card slides in when you say the word. Term in mono, one-line plain-English under it.

| ID | Term | Plain line |
|----|------|------------|
| **C1** | `POLYGLOT CQRS` | *Two databases. Each does the one thing it's best at.* |
| **C2** | `MILLICENTS` | *cents × 1000 — because a minute of music costs less than a penny* |
| **C3** | `APPEND-ONLY LEDGER` | *You never edit money. You only add a row.* |
| **C4** | `x402` | *HTTP 402 Payment Required — the agent pays, then plays* |
| **C5** | `SCALE-TO-ZERO` | *Idle cost is a design output — you architect for it* |
| **C6** | `SSE-KMS` | *encrypted at rest — the track is literally locked* |

---

## D. The 🔧/🎧 dual-caption pair (signature motif)

Two-line lower stack: top = the engineer flex, bottom = what it means for a human. Reuse this rhythm on every "cool" beat.

| ID | 🔧 the flex | 🎧 the plain version |
|----|------------|---------------------|
| **D1 — atomic write** | *One all-or-nothing write charges you and logs the play* | *"Can't double-charge. Can't overspend. Ever."* |
| **D2 — vibe search** | *Embedded with Bedrock, matched inside DynamoDB — no vector DB* | *"Tell it the mood. It builds the playlist."* |
| **D3 — MCP / agents** | *An AI agent licenses music by the second over MCP* | *"The same music your apps and AI can legally use."* |
| **D4 — encryption** | *AES-256-GCM at rest, key expires in ~150s* | *"You can't keep the song. You're paying for the moment."* |
| **D5 — Stripe payout** | *Every listener-minute = one ledger row = withdrawable* | *"Amanda sees exactly which minute paid her."* |

---

## E. Architecture diagram overlays (the 4 motion beats)

Full-frame motion-gfx you cut to, or run at 70% as a PIP while you narrate. The heart of the cut.

- **E1 — Two lanes.** Screen splits: `WRITES → DynamoDB` (fast, amber) | `READS → Aurora DSQL` (calm, blue). Labels animate: *command side · query side · polyglot CQRS*.
- **E2 — The atomic coin.** "charge balance" + "log play" snap into one locked block. Stamp: *one atomic write · can't double-charge · can't overspend*.
- **E3 — The permanent record.** Logged play flows along a line into Aurora DSQL → fills an append-only `royalty_ledger` + an already-totalled dashboard. Label: *dashboard = instant read, never recounts*.
- **E4 — Lock + ticking key.** Track = padlock `AES-256`. A paid second drops in a key visibly counting down → lock opens, music plays. Labels: *encrypted at rest · key expires ~150s · no pay, no key*.

---

## F. Live-app screen insets (PIP over you talking)

Corner or floating phone-frame insets of **real, shipped** UI. 60fps, keys hidden.

| ID | What's on screen | Status |
|----|------------------|--------|
| **F1** | Amanda's track playing in the player | shipped ✓ |
| **F2** | Balance / meter debiting live (per minute) | shipped ✓ |
| **F3** | Per-track earnings — millicents accruing | shipped ✓ |
| **F4** | Describe-a-vibe: type "late-night drive, synthwave" → ranked tracks | shipped ✓ |
| **F5** | Artist sets price (free → $1.00/min) + Stripe payout view | shipped ✓ |
| **F6** | Agent/MCP call returning music for a vibe | optional |

> ⚠️ **Do NOT inset** streaks, leaderboards, or "superfans by name" — not shipped, would be an overclaim.

---

## G. The "taximeter" motif (hero visual)

| ID | Element | Use |
|----|---------|-----|
| **G1** | Live amber per-minute meter ticking — pin to a corner the whole architecture section as a persistent reminder | persistent |
| **G2** | `STOP LISTENING → STOP PAYING` — meter freezes mid-tick | when you say it |
| **G3** | Coin-drop micro-animation each time a minute settles | over E2 / F2 |

---

## H. Code receipt snippets (for the AWS bench)

Tiny mono cards — show the actual invariant, ~2s, don't narrate. These earn credibility with judges.

- **H1** — the conditional debit: `balanceMillicents >= :amt` + `attribute_not_exists(PK)` → *"the database refuses to overspend"*
- **H2** — idempotency key: `<user>#<track>#<minute>` → *"replay this and nothing double-charges"*
- **H3** — `402 Payment Required` JSON body inset → *"machine-readable. the agent just pays."*
- **H4** — footnote strip: *AES-256-GCM · SSE-KMS + signed CloudFront · DSQL scales to zero*

---

## I. Logo / tech-stack strip

| ID | Content |
|----|---------|
| **I1** | Row of marks fading in as named: `DynamoDB · Aurora DSQL · Bedrock · Stripe · Vercel` |
| **I2** | `402` glyph badge — reuse near MCP beat |
| **I3** | Stripe Connect mark — over the payout beat |

---

## J. Section title / transition cards

Quick wipes between beats. Mono, amber underline.

- **J1** — `01 · METERED BY THE SECOND`
- **J2** — `02 · TWO DATABASES, ONE FLOW`
- **J3** — `03 · WHAT'S ACTUALLY COOL`
- **J4** — End card: `TollRoad` / *Polyglot CQRS · DynamoDB + Aurora DSQL · Bedrock · Vercel*

---

## K. Pull-quote cards (full-frame, big type)

For breath moments — the lines worth landing hard.

- **K1** — *"Every minute you stream is a billing event."*
- **K2** — *"Stripe for music royalties. The streaming is almost incidental."*
- **K3** — *"I get paid the instant you press play. I've never had that."* — Amanda (close)
- **K4** — *"Idle cost is a design output — you architect for it, or you pay for it."*

---

## Drop-in map — assembling over a 3:00 cut

| Window | You're saying… | Overlays to stack |
|--------|----------------|-------------------|
| 0:00–0:32 | Cold open + live demo | A1, F1→F2→F3, G1 |
| 0:32–0:48 | Two databases | J2, E1, C1 |
| 0:48–1:04 | One atomic write | E2, D1, G3, H1/H2 |
| 1:04–1:24 | The permanent record | E3, C3 |
| 1:24–1:40 | Encrypted, key-on-pay | E4, D4, B5, C6, H4 |
| 1:40–1:58 | Describe-a-vibe | F4, D2, I-Bedrock |
| 1:58–2:08 | MCP for agents | F6, D3, C4, I2, H3 |
| 2:08–2:20 | Artists price it / Stripe | F5, D5, B6, I3 |
| 2:20–2:42 | Close | K3, B1/B7, J4 |
