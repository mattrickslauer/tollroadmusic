# TollRoad — "Metered by the Second" (architecture-forward demo, shooting script)

**Date:** 2026-06-27
**Runtime target:** ~2:30–2:45 (HARD ceiling 2:55 — hackathon requires < 3:00)
**For:** H0 Hackathon — *Hack the Zero Stack with Vercel v0 and AWS Databases* (h01.devpost.com). Track 3 (million-scale). **The judges are the AWS Databases bench — this cut is built for them.**
**Format:** Fast, technical demo. Amanda Kurt opens it with the human hook and the live product; the spine is a founder-narrated walk through the **polyglot CQRS architecture**.

**What this cut optimizes for (the rubric):**
- **Technological Implementation** — the deep architecture walk (this is now the majority of the runtime).
- **Working app** — Amanda's live demo (required footage).
- **AWS databases explained** — **DynamoDB** (command/hot path) + **Aurora DSQL** (query/system-of-record), named and justified.
- **Originality / Impact** — per-second metering + the agent licensing rail.

---

## How this video is built
1. **Amanda is the cold open and the demo — fast.** Three short, technical-flavored soundbites; her track is the score. She gets us into the product in ~30s, then steps aside.
2. **The founder narrates the architecture** over motion-gfx diagrams — this is the bulk of the film and the reason the AWS bench leans in.
3. **Cut fast.** Tight, confident pacing. No lingering. Every diagram earns its seconds.

**Tone:** sharp, technical, proud of the build. Show the diagrams like you've shipped them — because you have.

## Cue legend
- **[AMANDA]** — quick interview/demo soundbite (her words; lines = target sense)
- **[OVERLAY: …]** — real app screen capture
- **[FOUNDER]** — founder VO/to-camera (the architecture narration)
- **[DIAGRAM: …]** — architecture motion-gfx (the heart of this cut)

---

## The film

### 1 — Cold open + live demo (0:00–0:32)
**[AMANDA — to camera, fast, her track under] → [OVERLAY: her track playing in the real app]**
> **[AMANDA]:** I'm Amanda Kurt. Independent artist. Every second you listen to me is now metered and paid — by the second. Watch.

**[OVERLAY: her track playing] → [OVERLAY: balance/meter debiting live, per minute] → [OVERLAY: artist earnings view — millicents accruing on her track]**
> **[AMANDA]:** There's my track. There's the meter running. I can see exactly what every minute earns me. The money moves in real time.

*(Required working-app footage — all of it real and shipped. Real capture, 60fps, keys hidden. Fast cuts — three overlays to three clauses. NOTE: only show UI that exists today — the live player, the balance/meter debiting, and the per-track earnings/ledger view. Do NOT stage streaks/leaderboards/"superfans by name"; those are design-stage, not shipped, and would be an overclaim to judges.)*

### 2 — How it works (visual, digestible) (0:32–1:40)

> **Principle for this section: the words stay simple, the *diagrams* carry the depth.** Each beat is one animated picture with a couple of on-screen labels the AWS bench can read (the real terms live in the labels, not the voiceover). The founder narrates plainly — four short beats, ~60s total.

**[DIAGRAM: one screen splits into two boxes — a fast "WRITES → DynamoDB" lane and a calm "READS → Aurora DSQL" lane. Labels animate in: "command side", "query side", "polyglot CQRS"]**
> **[FOUNDER]:** Paying artists by the second is a money problem — so we use two databases, each doing the one thing it's best at. The fast stuff you do — listening, paying — goes to **DynamoDB**. The things you read back come from **Aurora DSQL**.

**[DIAGRAM: a single coin animates — "charge your balance" + "log the play" snap together into one locked block. Stamp: "one atomic write · can't double-charge · can't overspend"]**
> **[FOUNDER]:** Every minute you listen, one quick, all-or-nothing write moves the money: it charges your balance and logs the play together — or not at all.

**[DIAGRAM: the logged play flows along a line into Aurora DSQL, which fills a clean "earnings" ledger + an artist dashboard that's already totalled. Labels: "permanent record", "append-only ledger", "dashboard = instant read, never recounts"]**
> **[FOUNDER]:** Each play flows into **Aurora DSQL**, which keeps the permanent record — every artist's earnings, already added up. So their dashboard loads instantly; it never has to crunch the numbers.

**[DIAGRAM: the track file shown as a padlock — "AES-256 encrypted" — a paid second drops in a key that's visibly ticking down; lock opens, music plays. Labels: "encrypted at rest", "key expires in ~150s", "no pay, no key"]**
> **[FOUNDER]:** And the track itself is locked — actually encrypted, not just hidden. Paying for the second is the only key, and that key expires in seconds. No copy ever sits in your browser to rip.
> **[CAPTION — 🎧 the plain version]:** *"You can't keep the song. You're paying for the moment you're hearing it."*

> *(Quiet on-screen footnote card, optional, ~2s — for the bench, not narrated: "AES-256-GCM at rest · SSE-KMS + signed CloudFront · built for ~16–23K writes/s · 1M concurrent streams · DSQL scales to zero." Let them read it; don't say it.)*

### 3 — What's actually cool (the shipped stuff) (1:40–2:20)

> **Directorial device (the "senior, but for everyone" motif):** each beat shows the engineer's flex AND its human translation on screen — 🔧 the clever bit, 🎧 what it means for you. Senior depth, zero gatekeeping. Every claim below is shipped code — see "What's real" at the bottom for file-level receipts.

**[OVERLAY: real app — type a vibe like "late-night drive, synthwave" → ranked tracks come back] then [DIAGRAM: vibe text → Amazon Bedrock embedding → nearest tracks, scored]**
> **[FOUNDER · 🔧 the flex]:** You don't search by title here — you describe a feeling. We embed what you typed with **Amazon Bedrock**, then match it against every track's fingerprint to build the set. And the vector search runs *inside DynamoDB* — no separate vector database to run.
> **[CAPTION — 🎧 the plain version]:** *"Tell it the mood. It builds the playlist."*

**[OVERLAY/DIAGRAM: an AI agent (or game engine) calling our MCP tools — search_music, start_session, next_track — music scoring a scene live]**
> **[FOUNDER]:** And it's not just for people. We ship an **MCP server**, so an AI agent — or a game — can ask for music by vibe and license it on the fly, by the second. (When an agent hits a track it hasn't paid for, the server just answers HTTP **402 — Payment Required**, and the agent pays and plays. No checkout, no human.)
> **[CAPTION — 🎧 the plain version]:** *"The same music your apps and AI assistants can legally use — paid fairly, automatically."*

**[OVERLAY: artist sets a per-track price (free → $1.00/min) → a payout to their bank via Stripe] then [DIAGRAM: one listener-minute → ledger row → artist's balance → Stripe transfer]**
> **[FOUNDER · 🔧 the flex]:** Artists set their own price — free, or up to a dollar a minute, in tenth-of-a-cent steps. Every minute someone listens writes one row to the ledger, and that's money they can withdraw straight to their bank through **Stripe** — no pool, no opaque weekly fraction.
> **[CAPTION — 🎧 the plain version]:** *"Amanda prices her own music, and sees exactly which minute paid her."*

### 4 — Close (2:20–2:42)
**[OVERLAY: live app] → [AMANDA — last line] → [END CARD]**
> **[AMANDA]:** I get paid the instant you press play. I've never had that.

**[END CARD] TollRoad wordmark · "Polyglot CQRS · DynamoDB + Aurora DSQL · Vercel" · her track resolves and out.**

---

## Amanda — keep it to 3 soundbites (capture more, cut to these)
Faster and more technical than emotional. Ask her to say, in her own words: (1) who she is + that she's metered/paid by the second, (2) what she's pointing at in the live app, (3) that she's paid the instant you press play.

## Shot / capture checklist
**Real app screen captures (60fps, hide keys) — the working-app proof. ONLY capture shipped UI:**
- [ ] Amanda's track playing in the player
- [ ] Balance/meter debiting live (the meter moving, per minute)
- [ ] Per-track earnings / ledger view (millicents accruing on her track)
- [ ] Describe-a-vibe search: type a mood → ranked tracks return
- [ ] Artist sets a per-track price (free → $1.00/min) + a Stripe payout view
- [ ] (Optional) an agent/MCP call returning music for a vibe
- [ ] ⚠️ Do NOT capture streaks / leaderboards / "superfans by name" — not shipped, would be an overclaim

**Architecture diagrams / motion-gfx (4 clean beats — the pictures carry the depth, labels carry the real terms):**
- [ ] Beat 1 — two lanes: "WRITES → DynamoDB" (fast) | "READS → Aurora DSQL" (calm); labels: command/query side, polyglot CQRS
- [ ] Beat 2 — "charge balance" + "log play" snap into one locked block; stamp: one atomic write · can't double-charge · can't overspend
- [ ] Beat 3 — play flows into Aurora DSQL → fills an append-only earnings ledger + an already-totalled dashboard (instant read)
- [ ] Beat 4 — track shown as padlock "AES-256 encrypted" → paid second drops in a ticking-down key → unlocks; labels: encrypted at rest · key expires ~150s · no pay, no key
- [ ] Optional footnote card (2s, on-screen only): AES-256-GCM at rest · SSE-KMS + signed CloudFront · ~16–23K writes/s · 1M streams · DSQL scales to zero
- [ ] Cool #1 — vibe text → Amazon Bedrock embedding → nearest tracks, scored (vector search inside DynamoDB, no separate vector DB)
- [ ] Cool #2 — agent/game calling MCP tools (search_music · start_session · next_track); small "402 → pay → play" inset
- [ ] Cool #3 — listener-minute → ledger row → artist balance → Stripe transfer
- [ ] End card · "Polyglot CQRS · DynamoDB + Aurora DSQL · Bedrock · Vercel"

**Talent (A7III):** Amanda fast soundbites + live-app reactions; founder clean architecture VO (a couple safety takes of the dense beats).

## Timing ledger
| Section | Window | Carried by |
|---|---|---|
| Cold open + live demo | 0:00–0:32 | Amanda + working app |
| How it works — beat 1: two databases | 0:32–0:48 | Founder + diagram |
| How it works — beat 2: one atomic write | 0:48–1:04 | Founder + diagram |
| How it works — beat 3: the permanent record (DSQL) | 1:04–1:24 | Founder + diagram |
| How it works — beat 4: encrypted, key-on-payment | 1:24–1:40 | Founder + diagram |
| Cool #1 — describe-a-vibe search (Bedrock) | 1:40–1:58 | App + founder |
| Cool #2 — MCP for agents (+ one 402 line) | 1:58–2:08 | App + founder |
| Cool #3 — artists price it, Stripe payouts | 2:08–2:20 | App + founder |
| Close | 2:20–2:42 | Founder + Amanda |

**< 3:00 is mandatory** — this cut still leaves margin. Keep the spoken words simple and let the diagrams + on-screen labels do the explaining (the 🔧/🎧 dual-caption motif is how we stay "senior but for everyone"). Never cut the working-app demo or drop the two database names (DynamoDB + Aurora DSQL); those are scored requirements.

---

## What's real vs. illustrated — file-level receipts (every claim verified in code)
Every line in this script is backed by shipped code. Receipts:

- **Live demo (§1) — real, shipped:** the player, the per-minute balance/meter debit, and the per-track earnings/ledger view. Metering + atomic debit: `backend/src/domain/wallet-store.ts:110–159`; earnings: `backend/src/domain/payouts.ts` (`getEarnedMillicents`).
  - ⚠️ **NOT shipped — do not show or claim:** streaks, leaderboards, "superfans by name." Design-doc only (no handler). Showing them would be an overclaim.
- **Polyglot CQRS (§2):** DynamoDB command path writes zero to DSQL (`wallet-store.ts:1–6`); single atomic `TransactWriteItems` = conditional debit (`balanceMillicents >= :amt`) + guarded METER `Put` (`attribute_not_exists(PK)`), idempotency key `<user>#<track>#<minute>`, replay returns `charged:false` (`wallet-store.ts:110–159`). Streams → projector Lambda (sole DSQL writer) → append-only `royalty_ledger` + precomputed `artist_daily_summary`, OCC `40001` retries (`infra/lib/tollroad-stack.ts:224–274`, `payouts.ts:23–36`).
- **Money in millicents (§2):** `balanceMillicents` / `amountMillicents` / `pricePerMinuteMillicents` (`wallet-store.ts:38,120–124`, `meter.ts:25`).
- **Encryption + key-on-payment (§2 beat 4):** AES-256-GCM at rest, `iv|tag|ciphertext`, plaintext removed (`infra/scripts/encrypt-media.mjs:49–51`); paid play → ~150s grant, signed CloudFront URL prod (OAC + SSE-KMS) / local decrypt with `TOLLROAD_MEDIA_KEY` (`backend/src/domain/streaming.ts:47,61–71`). Literal, not metaphor.
- **Describe-a-vibe search (§3 cool #1):** `POST /v1/discover { vibe }` embeds via **Amazon Bedrock Titan v2 (1024-dim)**, cosine-similarity over track vectors stored in the DynamoDB `TVEC` partition — **no separate vector DB** (`backend/src/handlers/discover.ts`).
- **MCP for agents + HTTP 402 (§3 cool #2):** real MCP server exposing `search_music` / `start_session` / `next_track` / `get_stream` (`mcp/src/server.ts`); DJ session state (no-repeat + signals) in DynamoDB (`backend/src/handlers/sessions.ts`, `domain/dj.ts`); genuine `402 Payment Required` with machine-readable body (`backend/src/lib/x402.ts:45–78`, test `backend/src/x402.test.ts`).
- **Creator rates + Stripe payouts (§3 cool #3):** per-track price 0 → 100,000 millicents ($1.00/min) in 100-millicent steps, free tier skips the balance guard (`backend/src/domain/artist-content.ts:67–75`, `wallet-store.ts:91–107`); ledger → `getAvailableMillicents` → `reserveWithdrawal` atomic reserve + idempotent Stripe transfer (`backend/src/domain/payouts.ts`, `handlers/payouts.ts`).
- **Vercel + Lambda (end card):** frontend reverse-proxies to the API (`frontend/app/api/v1/[...path]/route.ts`); backend is API Gateway REST + proxy Lambda (`infra/lib/tollroad-stack.ts:312–320`).
- **Honest framing of scale:** "built for ~16–23K writes/sec at a million concurrent streams" is a stated design target (`README.md:71`, CQRS design §2), justified by access pattern. Say "built for," not "currently serving."
- **Vision only (clearly framed):** AI agents licensing the catalog *at scale* — the rail, MCP, and 402 handshake are built; the agents-everywhere world is where it's going.
