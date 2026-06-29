import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "For Artists — TollRoad",
  description:
    "TollRoad pays artists per minute actually played — not per stream, not per pool. Set your rate. We take one transparent 10% cut; your 90% meters directly to you.",
};

const pillars = [
  {
    num: "01",
    accentClass: "pillarCardLime",
    numClass: "pillarNumLime",
    head: "Paid per minute heard",
    body: "You earn on real attention — not pooled per-stream fractions that shift every quarter. A two-minute listen pays half a four-minute listen. Math you can actually check.",
  },
  {
    num: "02",
    accentClass: "pillarCardAmber",
    numClass: "pillarNumAmber",
    head: "Transparent 10% cut",
    body: "One honest, openly-stated 10%. We say it out loud so you can hold us to it. Your 90% transfers directly to you — no opaque pool taking a hidden skim in between.",
  },
  {
    num: "03",
    accentClass: "pillarCardLime",
    numClass: "pillarNumLime",
    head: "Set your rate. Direct pay.",
    body: "You set your per-minute rate. Revenue meters directly to you every play — no quarterly settlement, no label approval gate. The meter runs; money follows.",
  },
  {
    num: "04",
    accentClass: "pillarCardBlue",
    numClass: "pillarNumBlue",
    head: "New agent demand",
    body: "AI agents are a new paying audience buying licensed music by the minute for workflows and ambient environments. Revenue that did not exist before — yours to capture.",
  },
] as const;

const oldItems = [
  "Pooled per-stream fractions",
  "Opaque quarterly payout rate",
  "Platform takes an undisclosed cut",
  "Settle months after plays",
  "Rate shifts each quarter — you never know",
];

const newItems = [
  "Per-minute metering — real attention",
  "Transparent 10% cut, stated plainly",
  "Your 90% meters directly to you",
  "No settlement delay — direct per play",
  "AI agents: new revenue channel, per minute",
];

export default function ForArtistsPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className={s.hero} id="top">
        <div className={s.heroAtmosphere} aria-hidden="true" />
        <div className={s.heroLaneDash} aria-hidden="true" />
        <div className={`wrap ${s.heroInner}`}>
          <Reveal>
            <p className={s.eyebrow}>For Artists · Paid Per Minute</p>
          </Reveal>

          <Reveal delay={60}>
            <h1 className={s.heroHeadline}>
              Get paid for every minute they actually listened.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className={s.heroSubhead}>
              TollRoad meters revenue per minute played — not per stream,
              not per play count. You set your rate. We take one transparent
              10% cut and say it out loud. Your 90% meters directly to you.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className={s.heroCtas}>
              <Cta href={ROUTES.signup} variant="green">Bring your catalog →</Cta>
              <Cta href="/#flow" variant="ghost">See the honest cut →</Cta>
            </div>
          </Reveal>

          <Reveal delay={260}>
            <div className={s.heroStat}>
              <span className={`${s.heroStatFigure} nd-meter-pulse`}>90%</span>
              <span className={s.heroStatLabel}>meters directly to you · per minute played</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── VALUE PILLARS ────────────────────────────────────── */}
      <section className={s.pillars} id="pillars">
        <div className="wrap">
          <Reveal>
            <div className={s.pillarsHeader}>
              <span className={s.pillarsEyebrow}>Why TollRoad · What Changes</span>
              <h2 className={s.pillarsHeadline}>
                Built for artists who want real numbers.
              </h2>
            </div>
          </Reveal>

          <div className={s.pillarGrid}>
            {pillars.map((p, i) => (
              <Reveal key={p.num} delay={i * 65}>
                <article className={`${s.pillarCard} ${s[p.accentClass]}`}>
                  <span className={`${s.pillarNum} ${s[p.numClass]}`}>{p.num}</span>
                  <h3 className={s.pillarHead}>{p.head}</h3>
                  <p className={s.pillarBody}>{p.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <hr className="lane" />

      {/* ── OLD VS TOLLROAD CONTRAST ─────────────────────────── */}
      <section className={s.contrast} id="contrast">
        <div className="wrap">
          <Reveal>
            <div className={s.contrastHeader}>
              <span className={s.contrastEyebrow}>The Honest Cut · Old Model vs. TollRoad</span>
              <h2 className={s.contrastHeadline}>
                Opaque pools ended.{" "}
                <em>Transparent metering begins.</em>
              </h2>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className={s.contrastGrid}>

              {/* OLD */}
              <div className={s.contrastOld}>
                <div className={s.contrastTagRow}>
                  <span className={s.tagOld}>The old model</span>
                </div>
                <ul className={s.contrastList}>
                  {oldItems.map((item) => (
                    <li key={item} className={s.contrastItemOld}>
                      <span className={s.contrastDash} aria-hidden="true">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className={s.contrastCaption}>
                  The math is hidden because opacity is the business model.
                  You get a statement; you never get the formula.
                </p>
              </div>

              {/* VS */}
              <div className={s.contrastVs} aria-hidden="true">
                <span className={s.vsLabel}>vs.</span>
              </div>

              {/* TOLLROAD */}
              <div className={s.contrastNew}>
                <div className={s.contrastTagRow}>
                  <span className={s.tagNew}>TollRoad</span>
                </div>
                <ul className={s.contrastList}>
                  {newItems.map((item) => (
                    <li key={item} className={s.contrastItemNew}>
                      <span className={`${s.contrastMark} nd-meter-pulse`} aria-hidden="true">✦</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className={s.contrastCaptionNew}>
                  The math is visible because transparency is the product.
                  You see the formula; you can audit every output.
                </p>
              </div>

            </div>
          </Reveal>

          {/* Editorial pull-quote */}
          <Reveal delay={200}>
            <figure className={s.pullquote}>
              <blockquote>
                <p>
                  &ldquo;We are the honest cut — one rate, stated plainly,
                  never buried in a pool.&rdquo;
                </p>
              </blockquote>
            </figure>
          </Reveal>

          {/* Two-column editorial copy */}
          <Reveal delay={260}>
            <div className={s.editorial}>
              <div className={s.editCol}>
                <h3 className={s.editHead}>Why we state the cut</h3>
                <p className={s.editBody}>
                  Streaming royalties have been a black box since the beginning. Platforms pool
                  everything, divide by plays, and hand artists a per-stream rate that shifts
                  every quarter. The math never adds up because you are not meant to see it.
                </p>
                <p className={s.editBody}>
                  TollRoad does not hide our cut. We state it plainly: 10%, ours. The
                  remaining 90% is yours — metered per minute, direct, no intermediary
                  skimming between the deduction and your account.
                </p>
              </div>
              <div className={s.editCol}>
                <h3 className={s.editHead}>Attention, not play counts</h3>
                <p className={s.editBody}>
                  When a listener skips at 30 seconds, you earn 30 seconds. When they
                  play a track twice through, you earn twice. The signal is honest — you
                  know which tracks hold attention and which lose it before the chorus.
                </p>
                <p className={s.editBody}>
                  AI agents follow the same meter. Every minute of licensed music they
                  consume charges the same rate as a human listener. That is a new revenue
                  channel that did not exist in the per-stream world.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <hr className="lane" />

      {/* ── HOW YOUR PAYOUT WORKS ────────────────────────────── */}
      <section className={s.payout} id="payout">
        <div className="wrap">
          <Reveal>
            <div className={s.payoutHeader}>
              <span className={s.payoutEyebrow}>How It Works · The Meter Path</span>
              <h2 className={s.payoutHeadline}>Three moves. Then money.</h2>
              <p className={s.payoutIntro}>
                No pool. No quarterly reconciliation. No mystery rates.
                Here is the path from play to your payout.
              </p>
            </div>
          </Reveal>

          <div className={s.payoutSteps}>

            {/* Step 01 */}
            <Reveal delay={0}>
              <div className={s.payoutStep}>
                <span className={s.stepNum}>01</span>
                <div className={s.stepContent}>
                  <h3 className={s.stepHead}>Someone plays</h3>
                  <p className={s.stepBody}>
                    A listener — or an AI agent — queues your track.
                    The meter starts the moment audio begins.
                    Not per play. Per minute.
                  </p>
                  <span className={s.stepLabel}>listener · agent · metered</span>
                </div>
              </div>
            </Reveal>

            {/* Step 02 — the split */}
            <Reveal delay={90}>
              <div className={s.payoutStep}>
                <div className={s.payoutSplitStat}>
                  <span className={s.splitAmberStat}>10%</span>
                  <span className={s.splitLimeStat}>90%</span>
                </div>
                <div className={s.stepContent}>
                  <h3 className={s.stepHead}>The cut, stated once</h3>
                  <p className={s.stepBody}>
                    TollRoad takes its transparent 10% and says so plainly.
                    The remaining 90% never enters a pool or a settlement queue.
                  </p>
                  <span className={s.stepLabel}>our cut · stated once · honest</span>
                </div>
              </div>
            </Reveal>

            {/* Step 03 */}
            <Reveal delay={180}>
              <div className={s.payoutStep}>
                <span className={`${s.stepNum} nd-meter-pulse`}>90%</span>
                <div className={s.stepContent}>
                  <h3 className={s.stepHead}>Meters directly to you</h3>
                  <p className={s.stepBody}>
                    Your 90% transfers directly. Per minute. Every play.
                    No delay, no approval gate.
                    Money follows attention.
                  </p>
                  <span className={`${s.stepLabel} ${s.stepLabelLime}`}>
                    your earnings · direct · per minute
                  </span>
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ── ARTIST CLOSER ─────────────────────────────────────── */}
      <section className={s.artistCloser} id="artist-start">
        <div className={s.closerAtmosphere} aria-hidden="true" />
        <div className={s.closerLaneDash} aria-hidden="true" />
        <div className={`wrap ${s.closerInner}`}>

          <Reveal>
            <p className={s.closerEyebrow}>Night Drive · For Artists</p>
          </Reveal>

          <Reveal delay={80}>
            <h2 className={s.closerHeadline}>
              <span className={`${s.closerLime} nd-meter-pulse`}>
                Bring your catalog.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={160}>
            <p className={s.closerHonestCut}>
              One transparent cut — 10%, stated plainly.
              <br />
              Your 90% meters directly to you per minute played.
            </p>
          </Reveal>

          <div className={s.closerDivider} aria-hidden="true" />

          <Reveal delay={240}>
            <div className={s.closerCtaRow}>
              <Cta href={ROUTES.signup} variant="green">Bring your catalog →</Cta>
              <Cta href="/#flow" variant="ghost">See the honest cut →</Cta>
            </div>
          </Reveal>

        </div>
      </section>
    </>
  );
}
