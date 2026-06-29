# TollRoad — "Amanda's Record" (cinematic doc, shooting script)

**Date:** 2026-06-27
**Runtime target:** ~2:15–2:30 (HARD ceiling 2:55 — hackathon requires < 3:00)
**For:** H0 Hackathon — *Hack the Zero Stack with Vercel v0 and AWS Databases* (h01.devpost.com)
**Format:** Short cinematic documentary about independent artist **Amanda Kurt**. Amanda's voice and music carry the film; the founder appears only at the end for the technical close.

**What the judges need to see (build the cut around these):**
- Footage of the **working app** (live demo — required).
- The **problem + target audience**, told through Amanda (independent artists + their fans).
- A clear explanation of the **AWS database** used — **Aurora DSQL** — named by the founder.
- Technical implementation, design, real-world impact, originality — all four judging axes.

---

## How this video is built

1. **Shoot Amanda as a documentary subject**, not an actor. Verité B-roll of her making/playing music + a sit-down interview. Her best real soundbites become the spine. The lines below are the *target sense* — use her actual words.
2. **Music is hers, wall-to-wall.** Her track is the score. Let it breathe; pull it down under interview, swell it on the visuals.
3. **The app demo is the turn**, not a feature tour — show it changing what her music means to her and her fans (real screen capture).
4. **The founder closes**, ~25s, to camera or VO over diagrams — the only "talking-head pitch" in the film, and it's technical.

**Tone:** cinematic, intimate, earned. Think a Song-Exploder / mini-doc feel, not an ad. Quiet beginning, emotional middle, confident technical landing.

## Cue legend
- **[AMANDA — interview]** — sit-down soundbite (her words; lines below are target sense)
- **[B-ROLL: …]** — cinematic footage of Amanda (no dialogue)
- **[OVERLAY: …]** — real app screen capture
- **[FOUNDER]** — founder to camera or VO
- **[DIAGRAM: …]** — motion-gfx for the technical close

---

## The film

### 1 — Cold open (0:00–0:18)
**[B-ROLL: Amanda alone — hands on the guitar/keys, late light, a room that's clearly hers] · her track comes up**
> **[AMANDA — interview, over the visuals]:** I've been making music since before anyone was listening. You don't do it for the money — there basically isn't any. You do it because you can't not.

*(Hook. End the open on a held image + a swell of her song before the title.)*

**[TITLE CARD: a single line — e.g. "Amanda Kurt is an independent artist." — quick, then gone]**

### 2 — The journey & the problem (0:18–0:55)
**[B-ROLL: playing a small room; phone showing streaming numbers; the unglamorous parts]**
> **[AMANDA — interview]:** I have people who know every word. They've listened for years. And at the end of it I make almost nothing — and I have no idea who they are. The platforms keep the relationship. I just… make the songs.

**[B-ROLL: Amanda scrolling her own streaming dashboard, unreadable splits]**
> **[AMANDA — interview]:** That's the part that breaks you. Not that it's hard. That the people who love it most, and the person who made it, never actually meet.

*(This is the problem statement + audience — independent artists and their fans — in her voice. Don't have the founder say it.)*

### 3 — The turn: TollRoad, shown working (0:55–1:38)
**[OVERLAY: her track playing in the real TollRoad app] → [B-ROLL: Amanda watching it on a laptop, reacting]**
> **[AMANDA — interview, lifting]:** Then they showed me this. Every second someone listens to me, it's counted — and it actually pays me. Not a fraction of a fraction. Real.

**[OVERLAY: streak counter ticking up] → [OVERLAY: leaderboard, a fan's handle climbing] → [OVERLAY: rewards unlocking]**
> **[AMANDA — interview]:** And I can finally *see* them. My biggest fans, by name. The ones who showed up every day — I can actually thank them.

*(This is the required working-app footage. Keep it real, 60fps, keys hidden. Time the three overlays to streak / superfans / rewards.)*

### 4 — The founder, technical close (1:38–2:05)
**[FOUNDER — to camera, brief] then [DIAGRAM: one second of listening → metered → paid to Amanda, in real time]**
> **[FOUNDER]:** Here's how it actually works. Every second of listening is metered and settled in real time on **Aurora DSQL** — that's the ledger that pays Amanda the instant you press play, and it's built to scale to millions of fans and artists.

**[DIAGRAM: same metered rail → an app / an AI agent licensing the track]**
> **[FOUNDER]:** And that same metered rail isn't just for our app. Any app — or any AI agent curating what you hear next — can license this catalog by the second, fairly. We're laying the rails so the future of music pays independent artists like Amanda first.

*(This single beat carries: the AWS database explanation the hackathon requires, the technical implementation, and the one futurist line. Keep it tight — no second take of the pitch.)*

### 5 — Close (2:05–2:25)
**[B-ROLL: Amanda back at the instrument, playing — the song resolves] then [AMANDA — interview, last line]**
> **[AMANDA]:** I just want to make music and have it reach the people who love it. For the first time, that feels possible.

**[END CARD] TollRoad wordmark · one CTA line · "Built on Aurora DSQL + Vercel" · her track resolves and out.**

---

## Amanda interview — questions to ask on the day
Capture far more than you need; cut to the truest 4–5 soundbites. Ask:
1. When did you start making music, and why don't you stop?
2. What's your relationship with the people who listen to you? Do you know who they are?
3. What do you actually earn from streaming — and how does that feel?
4. When you saw your plays metered and paid second-by-second, and saw your fans by name — what went through your head?
5. What would it mean if the future of music actually paid artists like you first?

## Shot / capture checklist
**Amanda (cinematic — A7III, fast glass, shallow DOF, practical light):**
- [ ] Hero B-roll: alone with the instrument, golden/late light (open + close)
- [ ] Performance: small room / live take
- [ ] Verité: the unglamorous reality (dashboards, the phone, the grind)
- [ ] Sit-down interview, clean audio (lav + boom), eyeline just off lens

**Real app screen captures (60fps, hide keys):**
- [ ] Amanda's track playing in the player
- [ ] Streak counter ticking up — *hero overlay*
- [ ] Leaderboard with a fan handle climbing
- [ ] Rewards unlocking
- [ ] Amanda reacting to the app on a laptop (B-roll, not screen)

**Diagrams / motion-gfx (technical close):**
- [ ] One second of listening → metered → paid to Amanda in real time (name Aurora DSQL)
- [ ] Same rail → app / AI agent licensing by the second
- [ ] End card / wordmark + "Built on Aurora DSQL + Vercel"

**Founder (A7III):** one clean technical close, a couple of safety takes.

## Timing ledger
| Section | Window | Carried by |
|---|---|---|
| Cold open | 0:00–0:18 | Amanda + her music |
| Journey & problem (+ audience) | 0:18–0:55 | Amanda interview |
| The turn — app demo (working app) | 0:55–1:38 | App overlays + Amanda |
| Technical close (Aurora DSQL + rail) | 1:38–2:05 | Founder + diagrams |
| Close | 2:05–2:25 | Amanda |

**< 3:00 is mandatory.** If long, trim inside section 2. Never cut the working-app demo (§3) or the Aurora DSQL line (§4) — those are scored hackathon requirements.

---

## What's real vs. illustrated (keep honest with judges)
- **Real, in the room:** Amanda Kurt is a real independent artist. Her music is the score.
- **Real, on screen (§3):** streaks, leaderboard, tracked rewards, the player streaming her real audio — live today.
- **Real backend, explained (§4):** per-second listening metered and settled on **Aurora DSQL**; the app deploys on Vercel. The metered licensing rail for apps/agents is genuinely built.
- **Vision (diagram):** AI agents curating what you hear at scale — the rail exists now; the agent-everywhere world is where it's going, shown as illustration, not as already-everywhere.
