import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";
import styles from "./Closer.module.css";

/**
 * Closer — Night Drive final CTA section.
 * Oversized Fraunces 900 headline at the high end of the display scale
 * (deliberately larger than --nd-display to mark this as the biggest
 * moment on the page). Honest-cut one-liner reprise in lime mono.
 * Both CTAs preserved: listener → /browse, artist → /artist/join.
 */
export default function Closer() {
  return (
    <section className={styles.section} id="start">
      {/* Amber road-glow atmosphere from below */}
      <div className={styles.atmosphere} aria-hidden="true" />

      {/* Amber dashed lane bar at the top edge */}
      <div className={styles.laneBar} aria-hidden="true" />

      <div className={`wrap ${styles.inner}`}>

        <Reveal className={styles.eyebrowReveal}>
          <p className={styles.eyebrow}>Night Drive · Get In</p>
        </Reveal>

        <Reveal delay={80} className={styles.headlineReveal}>
          <h2 className={styles.headline}>
            {/* Amber line: the listener action */}
            <span className={`${styles.headlineAmber} nd-amber-pulse`}>
              Pay by the minute.
            </span>
            {/* Italic editorial: the artist reward */}
            <span className={styles.headlineItalic}>
              Artists earn every second.
            </span>
          </h2>
        </Reveal>

        {/* Honest-cut reprise — one transparent line, BINDING */}
        <Reveal delay={180} className={styles.honestCutReveal}>
          <p className={styles.honestCut}>
            We take one honest cut, openly stated.
            <br />
            The rest meters directly to the artist.
          </p>
        </Reveal>

        {/* Stat callout — amber, anchored to ~$8 avg from Outcomes */}
        <Reveal delay={200} className={styles.statReveal}>
          <div className={styles.statCallout}>
            <span className={`${styles.statCalloutFigure} nd-amber-pulse`}>~$8</span>
            <span className={styles.statCalloutLabel}>avg / mo · metered listening</span>
          </div>
        </Reveal>

        {/* Pull-quote — honest-cut reinforcement */}
        <Reveal delay={230} className={styles.pullReveal}>
          <p className={styles.closerPull}>
            <em>One transparent cut — posted, never hidden.</em>{" "}
            Every cent above it meters to the artist the moment you listen.
            That&rsquo;s the whole model.
          </p>
        </Reveal>

        {/* Horizontal accent divider */}
        <div className={styles.divider} aria-hidden="true" />

        <Reveal delay={300} className={styles.ctaReveal}>
          <div className={styles.ctaRow}>
            <Cta href={ROUTES.browse}>Start Listening →</Cta>
            <Cta href={ROUTES.signup} variant="green">Join as Artist →</Cta>
          </div>
        </Reveal>

      </div>
    </section>
  );
}
