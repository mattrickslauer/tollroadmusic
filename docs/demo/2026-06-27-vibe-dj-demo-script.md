# TollRoad Vibe DJ — Demo Video Shooting Script

**Date:** 2026-06-27
**Runtime target:** ~2:45 (hard ceiling 3:00)
**Format:** Balanced 3-act — Hook → Proof → Vision
**Cameras:** Sony A7III (founder-to-camera, shallow-DOF interview), DJI / 360 (hands & device B-roll), screen capture (real product), AI visual / motion-gfx (concept + data plane)

---

## Throughline (the one thing every frame serves)

> *An AI agent describes a vibe, music plays, money moves per-second on AWS, and a real creator gets paid — Epidemic Sound, rebuilt for the agentic era.*

Everything that doesn't push this sentence forward gets cut. If a shot is pretty but off-thread, it goes.

## Visual treatment legend

| Tag | Meaning | Source |
|---|---|---|
| 🎤 | Founder to camera | Sony A7III, 50mm-ish, shallow DOF, soft key, dark backdrop |
| 🤚 | Hands / device B-roll | DJI / 360 — controller, headphones, laptop, phone, studio gear |
| 🖥️ | Real screen capture | Actual product: Claude/MCP, player, meter, vibe search |
| ✨ | AI visual / motion-gfx | Generated B-roll + animated data-plane diagram |

**Golden rule for honesty:** anything tagged 🖥️ must be a *real, unedited* recording (numbers may be pre-seeded for a clean run, but the flow is genuine). Anything conceptual or future-tense is ✨ and should read as illustration, never as a fake screenshot. See "What's real vs. illustrated" at the bottom — keep the team honest with judges.

## Spoken-line budget

Three founder lines, each deliverable in one breath (≤10s). Total VO across the film ≈ 300 words at an unhurried ~140 wpm. Let the music and the real numbers breathe; resist wall-to-wall narration.

---

# ACT 1 — HOOK · "The agent asks for music" (0:00–0:50)

### Beat 1.1 — Cold open (0:00–0:08)
- **Visual:** ✨ Pure black. A single line of text types out, terminal-style, then a held beat of silence.
- **On-screen text:** `tense final boss fight — 140 BPM synthwave`
- **Audio:** Silence under the typing. On the last keystroke → **music hits** (a real catalog synthwave track). 🤚 Hard cut to hands sliding headphones on / thumb hitting a controller trigger on the downbeat.
- **VO:** *(none — let the music land the cold open)*
- **Note:** No logo, no title card yet. We earn attention before we spend it.

### Beat 1.2 — The agent shops for music (0:08–0:25)
- **Visual:** 🖥️ Real Claude / MCP session. The **agent** (not a human) calls the tool:
  - `search_music({ vibe: "tense final boss fight, 140 BPM synthwave" })`
  - Ranked tracks stream back with similarity scores. Let one or two result rows be legible.
- **On-screen text:** subtle lower-third: `MCP server: tollroad-vibe-dj` · `tool: search_music`
- **VO (🎤 or narrator, over the screen):** *"This isn't a person searching a music library. It's an AI agent — and it's about to buy music by the minute."*

### Beat 1.3 — "It has a wallet, not a login" (0:25–0:40)
- **Visual:** 🖥️ The agent continues: `start_session({ context })` → `get_stream({ track_id })` → response is **`402 Payment Required`**. Hold on the 402 for a full beat — it's the whole thesis in one status code.
- **On-screen text:** highlight `402 Payment Required` + the payment terms line.
- **VO (🎤 founder, Line 1 — to camera, intercut):** *"The agent doesn't have a login. It has a wallet."*

### Beat 1.4 — Payment clears, music is live (0:40–0:50)
- **Visual:** 🖥️ `charge` clears (200) → 🤚 cut to the **real player UI**, track now playing, waveform moving. The loop closed itself: vibe → discovery → payment → stream, no human in the path.
- **On-screen text:** `agent → vibe → paid stream · in one loop`
- **Audio:** music swells slightly; first title card can appear here — **TollRoad** wordmark, small, lower corner.
- **VO:** *(none)*

---

# ACT 2 — PROOF · "The money is real, and it's on AWS" (0:50–2:00)

### Beat 2.1 — The money shot: live meter (0:50–1:15)
- **Visual:** 🖥️ Real product, split or stacked: the **session meter ticking up per minute** and the **wallet balance decrementing** as the track plays. This is filmed live — the numbers move because real charges are landing.
- **On-screen text:** `per-minute meter · live` / `balance: $— → $—`
- **VO (narrator):** *"Every minute that plays, the meter charges the agent's wallet — idempotent, to the millicent. This is metering that already runs in production."*

### Beat 2.2 — The AWS data plane lights up (1:15–1:35)
- **Visual:** ✨ Animated data-plane diagram, synced to the meter ticking from 2.1: a `MeterEvent` flows **DynamoDB (hot meter)** → **Streams** → **projector** → fans out to **Aurora DSQL (royalty ledger)** and **Aurora PostgreSQL + pgvector (the vibe search)**. Each node pulses as the event passes.
- **On-screen text:** node labels: `DynamoDB · hot meter` / `Aurora DSQL · royalty ledger` / `Aurora PG + pgvector · discovery`
- **VO (narrator):** *"One event, three AWS databases — each doing the one job it's best at. The hot meter, the system of record, and semantic vibe search."*
- **AI-visual prompt seed:** *"Sleek dark-mode architecture diagram, three database nodes connected by an animated event stream, a glowing data packet traveling left to right and forking into two ledgers, minimal, high-contrast, subtle teal/amber accent, motion-graphics style, no text artifacts."*

### Beat 2.3 — A real creator gets paid (1:35–1:55)
- **Visual:** 🎤 Founder to camera (credibility anchor), intercut with 🤚 a creator/studio B-roll detail (a hand on a mixing desk, a royalty figure on a dashboard).
- **VO (🎤 founder, Line 2 — to camera):** *"Every minute played, a real artist gets paid for the seconds people actually listened. That royalty ledger isn't a mock-up — it's live right now."*

### Beat 2.4 — Discovery is real, on demand (1:55–2:00)
- **Visual:** 🖥️ Quick-cut: type a *different* vibe (`"calm Sunday brunch, jazzy, low energy"`) → genuinely different ranked tracks return. Proves the brain, not a canned result.
- **On-screen text:** `vibe → ranked, licensed, streamable`
- **VO:** *(none — let the fast cut do the talking)*

---

# ACT 3 — VISION · "The moat" (2:00–2:45)

### Beat 3.1 — Any app, any agent (2:00–2:25)
- **Visual:** ✨ Fast, confident montage — three surfaces pulling the **same** metered stream: a game engine scene reacting to combat, an AI agent in a chat, a cafe/venue ambience. Each clip ~3s, cut on the beat.
- **On-screen text:** `MCP server` · `Client SDK` · `one backend`
- **VO (narrator):** *"Any app. Any agent. Score the moment with licensed music — just by describing the vibe."*
- **AI-visual prompt seed:** *"Three short cinematic vignettes intercut: a neon sci-fi game boss fight, a softly-lit cafe at golden hour, a focused person at a laptop with headphones — unified color grade, premium ad feel, shallow depth of field."*

### Beat 3.2 — The moat, the close (2:25–2:45)
- **Visual:** 🎤 Founder to camera, locked-off, final line. Then cut to end card.
- **VO (🎤 founder, Line 3 — to camera):** *"The model is simple: real creators, direct-licensed, paid per second of use — distributed to the agents that are becoming the customers. The rails are already running. That's the moat."*
- **End card (✨):** **TollRoad** wordmark · tagline: *"Metered music for the agentic era."* · one CTA line (URL / "Try the demo console").
- **Audio:** music resolves cleanly on the wordmark. Hard out — no fade-to-mush.

---

## Founder lines — clean takes sheet (memorize these three)

1. **(0:25–0:40)** "The agent doesn't have a login. It has a wallet."
2. **(1:35–1:55)** "Every minute played, a real artist gets paid for the seconds people actually listened. That royalty ledger isn't a mock-up — it's live right now."
3. **(2:25–2:45)** "The model is simple: real creators, direct-licensed, paid per second of use — distributed to the agents that are becoming the customers. The rails are already running. That's the moat."

*Delivery: calm, certain, slightly under-energized rather than over-hyped. The product is the flex; you don't have to sell it twice.*

---

## Shot list / capture checklist

**Real screen captures (🖥️) — record clean, 60fps, hide secrets/keys:**
- [ ] Claude/MCP `search_music` call + ranked results (Beat 1.2)
- [ ] `start_session` → `get_stream` → **402** with payment terms (Beat 1.3)
- [ ] `charge` 200 → player playing (Beat 1.4)
- [ ] Live session meter ticking + balance decrementing (Beat 2.1) — *the hero shot, get multiple takes*
- [ ] Second vibe query returning different tracks (Beat 2.4)

**Founder to camera (🎤) — Sony A7III:**
- [ ] 3 lines above, multiple takes each, with 2s of held silence before/after for editing handles

**Hands / device B-roll (🤚) — DJI / 360:**
- [ ] Headphones on / controller trigger on the downbeat (Beat 1.1)
- [ ] Hand on player / phone as track starts (Beat 1.4)
- [ ] Studio / mixing-desk detail for the creator beat (Beat 2.3)

**AI visuals / motion-gfx (✨):**
- [ ] Cold-open typing line on black (Beat 1.1)
- [ ] Animated 3-database data-plane diagram, synced to meter (Beat 2.2)
- [ ] Three-surface montage (Beat 3.1)
- [ ] End card / wordmark (Beat 3.2)

---

## Audio plan
- **Bed:** one real catalog synthwave track for Acts 1–2 (the same track the agent "bought" — continuity), softening under VO.
- **Act 3:** lift to a more anthemic cut for the montage, resolve on the wordmark.
- **VO:** record narrator + founder separately; keep founder lines as on-camera sync, narrator as clean booth VO.
- **Ducking:** music ducks ~6dB under every spoken line; comes back up in the silent beats (1.1, 1.4, 2.4).

---

## Timing ledger (verify in the edit)

| Act | Beats | Window | Budget |
|---|---|---|---|
| 1 — Hook | 1.1–1.4 | 0:00–0:50 | 50s |
| 2 — Proof | 2.1–2.4 | 0:50–2:00 | 70s |
| 3 — Vision | 3.1–3.2 | 2:00–2:45 | 45s |
| **Total** | | | **2:45** |

15s of headroom against the 3:00 ceiling. If you run long, the first cut is narration in 2.1 (the visual already tells it); never cut the 402 hold (1.3) or the live meter (2.1).

---

## What's real vs. illustrated (keep this honest with judges)

**Real, filmed live (🖥️):** the MCP agent loop (`search_music → start_session → get_stream → 402 → charge → stream`), the player streaming audio, the live per-minute meter + balance, and vibe/discovery search. These are confirmed working today.

**Illustrated (✨), clearly stylized so no one mistakes it for a screenshot:** the animated AWS data-plane diagram (a true depiction of the architecture, animated for clarity) and the three-surface montage (the vision: game engine / agent / venue all on one backend).

If a judge asks "is that real?" the answer for every 🖥️ beat is **yes, that's the running system** — which is exactly why we lead with proof instead of pitch.
