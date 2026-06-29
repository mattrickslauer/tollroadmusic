# TollRoad — "Metered by the Second" (architecture-forward demo, shooting script)

**Date:** 2026-06-27
**Runtime target:** ~2:00–2:15 (HARD ceiling 2:55 — hackathon requires < 3:00)
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

**[OVERLAY: streak ticking up] → [OVERLAY: leaderboard, a fan handle climbing] → [OVERLAY: balance debiting live]**
> **[AMANDA]:** There's my track. There's the meter running. There are my superfans — by name. The money moves in real time.

*(Required working-app footage. Real capture, 60fps, keys hidden. Fast cuts — three overlays to three clauses.)*

### 2 — How it works (visual, digestible) (0:32–1:40)

> **Principle for this section: the words stay simple, the *diagrams* carry the depth.** Each beat is one animated picture with a couple of on-screen labels the AWS bench can read (the real terms live in the labels, not the voiceover). The founder narrates plainly — four short beats, ~60s total.

**[DIAGRAM: one screen splits into two boxes — a fast "WRITES → DynamoDB" lane and a calm "READS → Aurora DSQL" lane. Labels animate in: "command side", "query side", "polyglot CQRS"]**
> **[FOUNDER]:** Paying artists by the second is a money problem — so we use two databases, each doing the one thing it's best at. The fast stuff you do — listening, paying — goes to **DynamoDB**. The things you read back come from **Aurora DSQL**.

**[DIAGRAM: a single coin animates — "charge your balance" + "log the play" snap together into one locked block. Stamp: "one atomic write · can't double-charge · can't overspend"]**
> **[FOUNDER]:** Every minute you listen, one quick, all-or-nothing write moves the money: it charges your balance and logs the play together — or not at all.

**[DIAGRAM: the logged play flows along a line into Aurora DSQL, which fills a clean "earnings" ledger + an artist dashboard that's already totalled. Labels: "permanent record", "append-only ledger", "dashboard = instant read, never recounts"]**
> **[FOUNDER]:** Each play flows into **Aurora DSQL**, which keeps the permanent record — every artist's earnings, already added up. So their dashboard loads instantly; it never has to crunch the numbers.

**[DIAGRAM: a lock on the track → a paid second turns it green → music plays. Label: "audio unlocks only once the second is paid · signed at the edge"]**
> **[FOUNDER]:** And the music only plays once the second is paid. The moment your payment clears, the track unlocks.

> *(Quiet on-screen footnote card, optional, ~2s — for the bench, not narrated: "built for ~16–23K writes/s · 1M concurrent streams · DSQL scales to zero." Let them read it; don't say it.)*

### 3 — The rail + close (1:40–2:10)
**[DIAGRAM: same metered rail → app / AI agent licensing by the second]**
> **[FOUNDER]:** And that same metered rail isn't just our app. Any app — or any AI agent picking your next song — can license this catalog by the second, fairly.

**[OVERLAY: live app] → [AMANDA — last line] → [END CARD]**
> **[AMANDA]:** I get paid the instant you press play. I've never had that.

**[END CARD] TollRoad wordmark · "Polyglot CQRS · DynamoDB + Aurora DSQL · Vercel" · her track resolves and out.**

---

## Amanda — keep it to 3 soundbites (capture more, cut to these)
Faster and more technical than emotional. Ask her to say, in her own words: (1) who she is + that she's metered/paid by the second, (2) what she's pointing at in the live app, (3) that she's paid the instant you press play.

## Shot / capture checklist
**Real app screen captures (60fps, hide keys) — the working-app proof:**
- [ ] Amanda's track playing in the player
- [ ] Streak counter ticking up
- [ ] Leaderboard with a fan handle climbing
- [ ] Balance debiting live (the meter moving)

**Architecture diagrams / motion-gfx (4 clean beats — the pictures carry the depth, labels carry the real terms):**
- [ ] Beat 1 — two lanes: "WRITES → DynamoDB" (fast) | "READS → Aurora DSQL" (calm); labels: command/query side, polyglot CQRS
- [ ] Beat 2 — "charge balance" + "log play" snap into one locked block; stamp: one atomic write · can't double-charge · can't overspend
- [ ] Beat 3 — play flows into Aurora DSQL → fills an append-only earnings ledger + an already-totalled dashboard (instant read)
- [ ] Beat 4 — track lock → paid second turns green → music plays; label: unlocks only once paid · signed at the edge
- [ ] Optional footnote card (2s, on-screen only): built for ~16–23K writes/s · 1M streams · DSQL scales to zero
- [ ] Same rail → app / AI agent licensing by the second
- [ ] End card · "Polyglot CQRS · DynamoDB + Aurora DSQL · Vercel"

**Talent (A7III):** Amanda fast soundbites + live-app reactions; founder clean architecture VO (a couple safety takes of the dense beats).

## Timing ledger
| Section | Window | Carried by |
|---|---|---|
| Cold open + live demo | 0:00–0:32 | Amanda + working app |
| How it works — beat 1: two databases | 0:32–0:48 | Founder + diagram |
| How it works — beat 2: one atomic write | 0:48–1:04 | Founder + diagram |
| How it works — beat 3: the permanent record (DSQL) | 1:04–1:24 | Founder + diagram |
| How it works — beat 4: pay-to-play unlock | 1:24–1:40 | Founder + diagram |
| The rail + close | 1:40–2:10 | Founder + Amanda |

**< 3:00 is mandatory** — and this cut leaves comfortable margin. Keep the words simple and let the diagrams do the explaining. Never cut the working-app demo or drop the two database names (DynamoDB + Aurora DSQL); those are scored requirements.

---

## What's real vs. illustrated (keep honest with judges)
- **Real, on screen:** streaks, leaderboard, live balance debit, the player streaming Amanda's real audio.
- **Real architecture (the diagrams depict the actual design):** polyglot CQRS — DynamoDB command path (atomic conditional debit + guarded meter event, idempotency key `user#track#minute`), DynamoDB Streams → projector Lambda → Aurora DSQL append-only `royalty_ledger` + `artist_daily_summary`, the two-balance consistency rule, signed-CloudFront stream gate. This is our data model, not a mockup.
- **Honest framing of scale:** sized/architected for ~16–23K writes/sec and a million concurrent streams (justified by access pattern). Say "built for," not "currently serving."
- **Vision (diagram):** AI agents licensing the catalog at scale — the metered rail is built; the agents-everywhere world is where it's going.
