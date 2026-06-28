import Reveal from "@/components/Reveal";
import { IconWallet, IconMeter, IconLedger } from "@/components/Icons";
import s from "./MeteredSteps.module.css";

export default function MeteredSteps() {
  return (
    <section className={s.section}>
      <div className="wrap">
        {/* ---- Section header ---- */}
        <Reveal className={s.head}>
          <span className={s.eyebrow}>
            <span className={s.eyebrowDot} />
            Per-minute metering · Like a utility
          </span>
          <h2 className={s.headline}>
            Three steps.{" "}
            <span className={s.headlineAccent}>No surprises.</span>
          </h2>
          <p className={s.subhead}>
            Load a balance. Listen. Artists earn per minute you actually played —
            not per skip, not per stream. One transparent cut to us; everything
            above it meters direct.
          </p>
        </Reveal>

        {/* ---- Steps grid ---- */}
        <div className={s.steps}>
          {/* Step 1 — Top up */}
          <Reveal className={`${s.step} ${s.stepAmber}`} delay={0}>
            <div className={s.stepNum} aria-hidden="true">
              01
            </div>
            <div className={s.iconRow}>
              <div className={s.iconWrap}>
                <IconWallet />
              </div>
              <span className={s.stepLabel}>Top up · Prepaid balance</span>
            </div>
            <h3 className={s.stepTitle}>Load your balance.</h3>
            <p className={s.stepBody}>
              Add credit before you listen — no auto-renew, no surprise billing
              cycle. Set your own ceiling: $5, $20, whatever fits. Nothing
              deducts until you actually hit play.
            </p>
            <div className={s.statBlock}>
              <span className={s.statValue}>$0</span>
              <span className={s.statCaption}>
                owed before you start — prepaid, nothing billed until you play
              </span>
            </div>
          </Reveal>

          {/* Step 2 — Play */}
          <Reveal className={`${s.step} ${s.stepBlue}`} delay={120}>
            <div className={s.stepNum} aria-hidden="true">
              02
            </div>
            <div className={s.iconRow}>
              <div className={s.iconWrap}>
                <IconMeter />
              </div>
              <span className={s.stepLabel}>
                <span className={s.liveDot} />
                Live meter · Per minute
              </span>
            </div>
            <h3 className={s.stepTitle}>Meter runs. You watch it.</h3>
            <p className={s.stepBody}>
              The moment audio plays, the meter ticks. Per-minute precision —
              not a flat monthly fee split across phantom listeners. Skip a
              track? The meter stops. You only pay for what you actually heard.
            </p>
            <div className={s.statBlock}>
              <span className={`${s.statValue} nd-meter-pulse`}>
                ¢0.4
              </span>
              <span className={s.statCaption}>
                avg per minute played · visible in real time
              </span>
            </div>
          </Reveal>

          {/* Step 3 — Artists paid */}
          <Reveal className={`${s.step} ${s.stepLime}`} delay={240}>
            <div className={s.stepNum} aria-hidden="true">
              03
            </div>
            <div className={s.iconRow}>
              <div className={s.iconWrap}>
                <IconLedger />
              </div>
              <span className={s.stepLabel}>Artists paid · Auditable ledger</span>
            </div>
            <h3 className={s.stepTitle}>Our cut is stated. Theirs is direct.</h3>
            <p className={s.stepBody}>
              TollRoad takes one honest, openly-stated cut — you see the
              percentage before you top up. Everything above that transfers
              straight to the artist: no opaque pool, no mystery per-stream
              rate, no hidden skimming.
            </p>
            <div className={s.statBlock}>
              <span className={s.statValue}>Direct</span>
              <span className={s.statCaption}>
                artist transfer after our stated cut — per minute played
              </span>
            </div>
            <div className={s.cutBadge}>
              One cut · out loud · auditable
            </div>
          </Reveal>
        </div>

        {/* ---- Pull-quote footer ---- */}
        <Reveal className={s.pullQuote} delay={360}>
          <div className={s.pullQuoteBar} aria-hidden="true" />
          <p className={s.pullQuoteText}>
            &ldquo;Pay by the minute. We take{" "}
            <span className={s.pullQuoteEmph}>one honest cut</span> — every
            other cent meters to the artist. No pool. No mystery rate.{" "}
            <span className={s.pullQuoteEmph}>Metered like electricity.</span>
            &rdquo;
          </p>
        </Reveal>
      </div>
    </section>
  );
}
