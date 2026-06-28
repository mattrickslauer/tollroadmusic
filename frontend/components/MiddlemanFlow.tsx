import Reveal from "@/components/Reveal";
import { IconYou, IconPool, IconArtist } from "@/components/Icons";
import s from "./MiddlemanFlow.module.css";

export default function MiddlemanFlow() {
  return (
    <section className={s.root} id="flow">
      <div className="wrap">

        {/* ─── Header ─────────────────────────────────────────── */}
        <Reveal>
          <div className={s.header}>
            <span className={s.eyebrow}>THE HONEST CUT · TRANSPARENT BY DESIGN</span>
            <h2 className={s.headline}>
              One cut. Out loud.{" "}
              <em>The rest is theirs.</em>
            </h2>
            <p className={s.intro}>
              We take one honest, openly-stated cut — no hiding it in fine print,
              no burying it in a pool. Every other cent transfers directly to the
              artist, per minute you actually played.
            </p>
          </div>
        </Reveal>

        {/* ─── Flow comparison ────────────────────────────────── */}
        <Reveal delay={150}>
          <div className={s.comparisons}>

            {/* OLD WAY */}
            <div className={s.scenario}>
              <div className={s.scenarioHead}>
                <span className={s.tagOld}>The old way</span>
              </div>
              <div className={s.flowRow}>
                <div className={s.node}>
                  <div className={s.ico}><IconYou /></div>
                  <span className={s.nodeLabel}>You</span>
                  <span className={s.nodeData}>$11.99 / mo</span>
                </div>
                <div className={s.connOld} aria-hidden="true">
                  <div className={s.connLine} />
                </div>
                <div className={`${s.node} ${s.nodePool}`}>
                  <div className={s.ico}><IconPool /></div>
                  <span className={s.nodeLabel}>Platform + pool</span>
                  <span className={s.nodeDataMystery}>??? cut · ??? pool</span>
                  <span className={s.nodeSub}>rate undisclosed</span>
                </div>
                <div className={`${s.connOld} ${s.connShrink}`} aria-hidden="true">
                  <div className={s.connLine} />
                </div>
                <div className={s.node}>
                  <div className={s.ico}><IconArtist /></div>
                  <span className={s.nodeLabel}>Artist</span>
                  <span className={s.nodeDataPennies}>fractions</span>
                  <span className={s.nodeSub}>per stream · no visibility</span>
                </div>
              </div>
              <p className={s.scenarioCaption}>
                Platforms pool every subscriber&apos;s payment, divide by total streams, and produce
                a per-stream rate that changes quarterly. The math is hidden because
                opacity is the business model.
              </p>
            </div>

            {/* DIVIDER */}
            <div className={s.vsRow} aria-hidden="true">
              <span className={s.vsLine} />
              <span className={s.vsLabel}>vs.</span>
              <span className={s.vsLine} />
            </div>

            {/* TOLLROAD WAY */}
            <div className={`${s.scenario} ${s.scenarioNew}`}>
              <div className={s.scenarioHead}>
                <span className={s.tagNew}>TollRoad</span>
              </div>
              <div className={s.flowRow}>

                <div className={`${s.node} ${s.nodeYouNew}`}>
                  <div className={`${s.ico} ${s.icoNew}`}><IconYou /></div>
                  <span className={s.nodeLabel}>You</span>
                  <span className={s.nodeDataBlue}>per minute played</span>
                </div>

                <div className={s.connNew} aria-hidden="true">
                  <div className={`${s.connLine} ${s.connLineAmber}`} />
                </div>

                {/* THE HONEST CUT NODE */}
                <div className={`${s.node} ${s.nodeToll}`}>
                  <div className={s.splitBar}>
                    <div className={s.splitAmber}>
                      <span className={s.splitLabelAmber}>our cut</span>
                      <span className={s.splitSub}>openly stated</span>
                    </div>
                    <div className={`${s.splitLime} nd-meter-pulse`}>
                      <span className={s.splitLabelLime}>to artist</span>
                      <span className={s.splitSub}>everything else</span>
                    </div>
                  </div>
                  <span className={s.tollLabel}>TollRoad</span>
                  <span className={s.tollSub}>transparent · one rate</span>
                </div>

                <div className={`${s.connNew} ${s.connDirect}`} aria-hidden="true">
                  <div className={`${s.connLine} ${s.connLineLime}`} />
                  <span className={s.directLabel}>direct</span>
                </div>

                <div className={`${s.node} ${s.nodeArtistNew}`}>
                  <div className={`${s.ico} ${s.icoLime}`}><IconArtist /></div>
                  <span className={s.nodeLabel}>Artist</span>
                  <span className={s.nodeDataLime}>earned per minute</span>
                  <span className={s.nodeSub}>no pool · no mystery</span>
                </div>

              </div>
              <p className={`${s.scenarioCaption} ${s.scenarioCaptionNew}`}>
                One transparent cut stays with TollRoad. The remainder transfers directly
                to the artist — every minute, every play. No pool. No quarterly reconciliation.
                The math is visible because transparency is the point.
              </p>
            </div>

          </div>
        </Reveal>

        {/* ─── Pull-quote ──────────────────────────────────────── */}
        <Reveal delay={200}>
          <figure className={s.pullquote}>
            <blockquote>
              <p>&ldquo;We are the middleman — just an honest one.&rdquo;</p>
            </blockquote>
          </figure>
        </Reveal>

        {/* ─── Editorial columns ──────────────────────────────── */}
        <Reveal delay={250}>
          <div className={s.editorial}>
            <div className={s.editCol}>
              <h3 className={s.editHead}>Why we show the cut</h3>
              <p className={s.editBody}>
                Streaming royalties have been a black box since the beginning. Platforms pool
                everything, divide by plays, and hand artists a per-stream rate that shifts
                every quarter. The math never adds up because you are not meant to see it.
              </p>
              <p className={s.editBody}>
                TollRoad does not hide our cut. We state it plainly. You know exactly what
                you pay and exactly where it goes. The only mystery is what you discover
                in the music.
              </p>
            </div>
            <div className={s.editCol}>
              <h3 className={s.editHead}>Direct, not pooled</h3>
              <p className={s.editBody}>
                After our one honest cut, the remainder does not enter a pool. It does not
                wait for a quarterly settlement or a label approval. It meters directly to
                the artist — proportional to the minutes you actually listened.
              </p>
              <p className={s.editBody}>
                A two-minute skip pays the artist less than a full listen-through. Artists
                earn on attention, not on play counts. That is the honest math this industry
                has been missing.
              </p>
            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}
