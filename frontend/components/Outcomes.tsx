import Reveal from "@/components/Reveal";
import styles from "./Outcomes.module.css";

export default function Outcomes() {
  return (
    <section className={styles.section} id="outcomes">
      <div className="wrap">

        {/* Section header */}
        <header className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>OUTCOMES · METERED</span>
          <h2 className={styles.sectionHeadline}>Both sides of the meter.</h2>
          <p className={styles.sectionSub}>
            One system. Two wins. Listeners pay only for what they actually hear.
            Artists earn for every minute actually played — not from a shrinking pool.
          </p>
        </header>

        {/* Two-panel grid */}
        <div className={styles.panels}>

          {/* ── LISTENER PANEL ── */}
          <Reveal>
            <div className={styles.listenerCard}>

              <div className={styles.cardTop}>
                <span className={styles.cardEyebrow}>FOR LISTENERS</span>
                <div className={styles.cardLane} aria-hidden="true" />
              </div>

              <h3 className={styles.cardHeadline}>Pay for what you hear.</h3>

              <div className={styles.statBlock}>
                <span
                  className={styles.statAmber}
                  aria-label="approximately 8 dollars per month on average"
                >
                  ~$8
                </span>
                <div className={styles.statAnnotation}>
                  <span className={styles.statMain}>avg. per month</span>
                  <span className={styles.statSub}>metered to your minutes</span>
                </div>
              </div>

              <p className={styles.body}>
                Stop listening, stop paying. The meter only runs when music plays —
                typical listeners spend roughly a third less than a flat plan.
                Walk away mid-album and the clock stops. No subscriptions to feel
                guilty about skipping.
              </p>

              {/* Bar comparison: flat vs. metered */}
              <div
                className={styles.compareGrid}
                aria-label="Price comparison: flat plan $11.99 vs. metered approximately $8"
              >
                <div className={styles.compareRow}>
                  <span className={styles.compareLabel}>Flat plan</span>
                  <div className={styles.compareBar} role="presentation">
                    <div
                      className={styles.compareBarFill}
                      style={{ width: "100%" }}
                      data-bar="flat"
                    />
                  </div>
                  <span className={styles.comparePrice} data-old>$11.99</span>
                </div>
                <div className={styles.compareRow}>
                  <span className={styles.compareLabel}>Metered</span>
                  <div className={styles.compareBar} role="presentation">
                    <div
                      className={styles.compareBarFill}
                      style={{ width: "67%" }}
                      data-bar="metered"
                    />
                  </div>
                  <span className={styles.comparePrice} data-new>~$8</span>
                </div>
              </div>

              <p className={styles.footnote}>
                TollRoad takes one honest, transparent cut — openly stated.
                Every remaining cent meters directly to the artist.
              </p>

            </div>
          </Reveal>

          {/* ── ARTIST PANEL ── */}
          <Reveal delay={150}>
            <div className={styles.artistCard}>

              <div className={styles.cardTop}>
                <span className={styles.cardEyebrow}>FOR ARTISTS</span>
                <div className={styles.cardLane} aria-hidden="true" />
              </div>

              <h3 className={styles.cardHeadline}>Earn on every minute played.</h3>

              <div className={styles.statBlock}>
                <span
                  className={`${styles.statLime} nd-meter-pulse`}
                  aria-label="earnings per minute played"
                >
                  ₵/min
                </span>
                <div className={styles.statAnnotation}>
                  <span className={styles.statMain}>per minute played</span>
                  <span className={styles.statSub}>not per stream · not from a pool</span>
                </div>
              </div>

              <p className={styles.body}>
                Set your rate. When a listener&apos;s meter runs on your track,
                you earn — not from an opaque royalty pool that shrinks every
                time another artist signs up. TollRoad shows its cut openly;
                everything else transfers directly to you.
              </p>

              <ul className={styles.artistCallouts} aria-label="Artist advantages">
                <li className={styles.calloutItem}>
                  <span className={styles.calloutDot} aria-hidden="true" />
                  <span>Per minute, not per stream — skips earn nothing for anyone</span>
                </li>
                <li className={styles.calloutItem}>
                  <span className={styles.calloutDot} aria-hidden="true" />
                  <span>Transparent cut, openly stated — no mystery math, no hidden pool</span>
                </li>
                <li className={styles.calloutItem}>
                  <span className={styles.calloutDot} aria-hidden="true" />
                  <span>Direct transfer — not divided among a growing catalog you can&apos;t see</span>
                </li>
              </ul>

              <p className={styles.footnote}>
                Artists keep what listeners pay for their minutes, after TollRoad&apos;s
                stated cut — shown openly, never hidden.
              </p>

            </div>
          </Reveal>

        </div>

        {/* Full-width editorial pull-quote */}
        <Reveal delay={200}>
          <blockquote className={styles.pullQuote}>
            <span className={styles.pullQuoteText}>
              &ldquo;Pay like electricity. Earn like electricity.
              The meter tells no lies.&rdquo;
            </span>
            <cite className={styles.pullCite}>The TollRoad model</cite>
          </blockquote>
        </Reveal>

      </div>
    </section>
  );
}
