# TollRoad — "Metered by the Second" (architecture-forward demo, shooting script)

**Date:** 2026-06-27
**Runtime target:** ~2:25–2:40 (HARD ceiling 2:55 — hackathon requires < 3:00)
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

### 2 — The architecture (the spine) (0:32–2:05)

**[FOUNDER VO] + [DIAGRAM: system splits into two — "COMMAND: DynamoDB" | "QUERY: Aurora DSQL"]**
> **[FOUNDER]:** Metering music by the second is a write-heavy money path, so we split the system in two — polyglot CQRS. Every charge writes to **DynamoDB**. Everything you read is served from **Aurora DSQL**. Each database picked for one access pattern, not as a default.

**[DIAGRAM: the atomic TransactWriteItems — conditional debit ⨝ guarded meter event, "all-or-nothing"]**
> **[FOUNDER]:** The hot path is a single atomic DynamoDB transaction: a conditional debit that stops dead at a zero balance, committed together with one metered-minute event — keyed user-track-minute, one event per unique minute. It can't double-charge, and a balance can't go negative. Single-digit-millisecond writes.

**[DIAGRAM: DynamoDB Streams → projector Lambda → DSQL (append-only ledger + precomputed daily summary)]**
> **[FOUNDER]:** That event fans out through DynamoDB Streams into a projector Lambda, which builds the system-of-record in Aurora DSQL — an append-only royalty ledger, and a precomputed per-artist daily summary. So an artist's earnings dashboard is a cheap point read. It never scans the ledger.

**[DIAGRAM: two balances — DynamoDB "authoritative / real-time" vs DSQL "reconciliation / audit"]**
> **[FOUNDER]:** There are two balances by design. The authoritative one lives in DynamoDB and gates money and playback in real time. DSQL holds the reconciliation balance for audit and history. The projector is the *only* writer of that ledger — which makes the whole pipeline exactly-once, and the rollup correct by construction.

**[DIAGRAM: DSQL grain — "no FKs · async indexes · append-only · scale-to-zero" + "16–23K writes/s · 1M streams"]**
> **[FOUNDER]:** We built to Aurora DSQL's grain — no foreign keys, async indexes, an append-only ledger to dodge write contention — and it scales to zero between runs. The command side is sized for sixteen to twenty-three thousand writes a second. A million concurrent streams.

**[DIAGRAM: stream gate — paid minute in DynamoDB → short-TTL signed CloudFront URL]**
> **[FOUNDER]:** And the audio only unlocks once you've paid for the minute. The stream endpoint issues a short-lived signed CloudFront URL the instant DynamoDB confirms a recent paid minute. Pay-per-second, enforced at the edge.

### 3 — The rail + close (2:05–2:35)
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

**Architecture diagrams / motion-gfx (the spine — make these crisp and real):**
- [ ] CQRS split: COMMAND=DynamoDB | QUERY=Aurora DSQL
- [ ] Atomic `TransactWriteItems`: conditional stop-at-zero debit ⨝ guarded meter event (idempotency key `user#track#minute`)
- [ ] DynamoDB Streams → projector Lambda → DSQL append-only ledger + precomputed daily summary
- [ ] Two-balance consistency rule (authoritative DynamoDB vs reconciliation DSQL)
- [ ] DSQL grain (no FKs / async indexes / append-only / scale-to-zero) + 16–23K writes/s · 1M streams
- [ ] Stream gate: paid minute → short-TTL signed CloudFront URL
- [ ] Same rail → app / AI agent licensing by the second
- [ ] End card · "Polyglot CQRS · DynamoDB + Aurora DSQL · Vercel"

**Talent (A7III):** Amanda fast soundbites + live-app reactions; founder clean architecture VO (a couple safety takes of the dense beats).

## Timing ledger
| Section | Window | Carried by |
|---|---|---|
| Cold open + live demo | 0:00–0:32 | Amanda + working app |
| Architecture: CQRS split | 0:32–0:50 | Founder + diagram |
| Architecture: atomic hot-path txn | 0:50–1:12 | Founder + diagram |
| Architecture: Streams → projector → DSQL | 1:12–1:32 | Founder + diagram |
| Architecture: two-balance rule | 1:32–1:48 | Founder + diagram |
| Architecture: DSQL grain + scale | 1:48–2:00 | Founder + diagram |
| Architecture: signed-URL stream gate | 2:00–2:05 | Founder + diagram |
| The rail + close | 2:05–2:35 | Founder + Amanda |

**< 3:00 is mandatory.** If long, trim the rail line (§3) or tighten the cold open — never cut the working-app demo or any named-database architecture beat; those are the scored requirements.

---

## What's real vs. illustrated (keep honest with judges)
- **Real, on screen:** streaks, leaderboard, live balance debit, the player streaming Amanda's real audio.
- **Real architecture (the diagrams depict the actual design):** polyglot CQRS — DynamoDB command path (atomic conditional debit + guarded meter event, idempotency key `user#track#minute`), DynamoDB Streams → projector Lambda → Aurora DSQL append-only `royalty_ledger` + `artist_daily_summary`, the two-balance consistency rule, signed-CloudFront stream gate. This is our data model, not a mockup.
- **Honest framing of scale:** sized/architected for ~16–23K writes/sec and a million concurrent streams (justified by access pattern). Say "built for," not "currently serving."
- **Vision (diagram):** AI agents licensing the catalog at scale — the metered rail is built; the agents-everywhere world is where it's going.
