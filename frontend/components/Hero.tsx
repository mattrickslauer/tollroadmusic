import Meter from "@/components/Meter";
import Cta from "@/components/Cta";
import SignupCta from "@/components/SignupCta";
import { ROUTES, SECTIONS } from "@/lib/routes";
import styles from "./Hero.module.css";

/* ----------------------------------------------------------------
   Marquee ticker items — facts that scroll continuously beneath
   the hero. Duplicated ×2 inside nd-marquee-track for a seamless
   loop. The animation is CSS-only (nd-marquee-scroll in landing.css).
   ---------------------------------------------------------------- */
const TICKER_ITEMS = [
  "Per-minute metering",
  "One transparent cut",
  "Artists paid direct",
  "¢/min — not ¢/stream",
  "Pay only what you play",
  "Real-time royalties",
  "No mystery rate",
  "Honest by design",
  "~$8 avg / month",
  "Your toll · their income",
] as const;

function TickerRow() {
  return (
    <>
      {TICKER_ITEMS.map((text, i) => (
        <span key={i} className={styles.tickerItem}>
          <span className={styles.tickerSep} aria-hidden="true">◆</span>
          {text}
        </span>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------
   Hero — Night Drive identity
   React Server Component: Meter + SignupCta are client islands
   imported here; no browser APIs at this level.
   ---------------------------------------------------------------- */
export default function Hero() {
  return (
    <header className={styles.hero} id="top">
      {/* Subtle lane-stripe texture — aria-hidden decorative layer */}
      <div className={`nd-lane-bg ${styles.laneLayer}`} aria-hidden="true" />

      {/* Main editorial grid */}
      <div className={`wrap ${styles.inner}`}>

        {/* Left: oversized copy */}
        <div className={styles.copy}>

          {/* Mono eyebrow with live pulse dot */}
          <p className={`${styles.eyebrow} nd-fade-up`} style={{ '--nd-fade-delay': '0s' } as React.CSSProperties}>
            <span className={`${styles.eyebrowDot} nd-meter-pulse`} aria-hidden="true" />
            Night Drive · Per-minute metering
          </p>

          {/* Oversized display headline */}
          <h1 className={`${styles.headline} nd-fade-up`} style={{ '--nd-fade-delay': '0.07s' } as React.CSSProperties}>
            Pay by the minute.
            <span className={styles.headlineAccent}>Artists keep the rest.</span>
          </h1>

          {/* Honest-cut subhead — states our cut explicitly */}
          <p className={`${styles.subhead} nd-fade-up`} style={{ '--nd-fade-delay': '0.14s' } as React.CSSProperties}>
            We take <strong>one honest, out-loud cut.</strong> Every remaining
            cent goes direct to the artist — metered by the minute, not pooled
            by the platform.
          </p>

          {/* Data annotation: rate + honest-cut context */}
          <p className={`${styles.rateNote} nd-fade-up`} style={{ '--nd-fade-delay': '0.2s' } as React.CSSProperties}>
            <span className={styles.rateNoteAmount}>$0.0011</span>
            <span className={styles.rateNoteDivider}>/</span>
            min listener cost
            <span className={styles.rateNoteDivider}>·</span>
            artists earn the balance after our transparent platform cut
          </p>

          {/* Three CTAs: Listen now, Sign up (free minutes), See how it works */}
          <div className={`${styles.ctaRow} nd-fade-up`} style={{ '--nd-fade-delay': '0.26s' } as React.CSSProperties}>
            <Cta href={ROUTES.browse} variant="primary">Listen now</Cta>
            <SignupCta />
            <Cta href={SECTIONS.flow} variant="ghost">See how</Cta>
          </div>
        </div>

        {/* Right: live metered player — the product proof */}
        <div className={`${styles.meterCol} nd-fade-up`} style={{ '--nd-fade-delay': '0.18s' } as React.CSSProperties}>
          <Meter />
        </div>
      </div>

      {/* Marquee ticker strip — rolling facts beneath the hero */}
      <div className={styles.ticker} aria-hidden="true">
        <div className="nd-marquee-wrap">
          <div
            className="nd-marquee-track"
            style={{ '--nd-marquee-duration': '34s' } as React.CSSProperties}
          >
            <TickerRow />
            <TickerRow />
          </div>
        </div>
      </div>
    </header>
  );
}
