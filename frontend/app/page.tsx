import Meter from "@/components/Meter";
import Reveal from "@/components/Reveal";
import BrandMark from "@/components/BrandMark";

export default function Home() {
  return (
    <>
      {/* ---------------- NAV ---------------- */}
      <nav className="nav">
        <div className="wrap nav-inner">
          <a href="#top" className="brand">
            <BrandMark />
            TollRoad
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#who">Who it&apos;s for</a>
            <a href="#infra">Infrastructure</a>
            <a href="#start" className="btn btn-primary">
              Open a balance →
            </a>
          </div>
        </div>
      </nav>

      {/* ---------------- HERO ---------------- */}
      <header className="hero" id="top">
        <div className="hero-bg" />
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow fade-up d1">
              <span className="dot" />
              <span className="mono-label">Metered-billing DSP for music</span>
            </span>

            <h1 className="hero-title fade-up d2">
              Pay for the minutes you <em>actually hear.</em>
            </h1>

            <p className="hero-sub fade-up d2">
              Streaming runs on flat fees and pooled payouts. TollRoad meters
              playback like a utility — every minute is a billing event tied to
              one listener and one rightsholder. Stop listening, stop paying.
            </p>

            <div className="hero-cta fade-up d4">
              <a href="#start" className="btn btn-primary">
                Open a balance →
              </a>
              <a href="#how" className="btn btn-ghost">
                See the meter run
              </a>
            </div>

            <div className="hero-foot fade-up d5">
              <div className="stat">
                <div className="n">~$8</div>
                <div className="l">avg listener / mo, metered</div>
              </div>
              <div className="stat">
                <div className="n">100%</div>
                <div className="l">payout from minutes you played</div>
              </div>
              <div className="stat">
                <div className="n">~45s</div>
                <div className="l">meter tick — forge-proof</div>
              </div>
            </div>
          </div>

          <Meter />
        </div>
      </header>

      <hr className="lane" />

      {/* ---------------- PROBLEM ---------------- */}
      <section className="section" id="problem">
        <div className="wrap">
          <Reveal className="sec-head">
            <span className="mono-label kicker amber">01 — The toll today</span>
            <h2>Flat fees and a shared pot.</h2>
            <p>
              You pay $11.99 whether you stream 30 hours or 3. Your fee lands in
              one bucket and is split by share of total platform streams — so it
              mostly funds whoever is trending, not who you played.
            </p>
          </Reveal>

          <Reveal className="problem-grid">
            <div className="problem-cell bad">
              <div className="big">$11.99</div>
              <h3>Listeners overpay</h3>
              <p>
                The average listener plays ~9,800 minutes a year. At a fair
                per-minute rate that&apos;s about $8/mo. Light listeners
                subsidize heavy ones under one flat price.
              </p>
            </div>
            <div className="problem-cell good">
              <div className="big">Pro-rata</div>
              <h3>Artists paid by a pool</h3>
              <p>
                Per-stream payout is an opaque, shrinking slice of a shared pot.
                There&apos;s no clean line from “I heard 4 minutes” to “this
                artist earned for those 4 minutes.”
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <hr className="lane" />

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="section" id="how">
        <div className="wrap">
          <Reveal className="sec-head">
            <span className="mono-label kicker amber">02 — The mechanism</span>
            <h2>Metering, not estimating.</h2>
            <p>
              Playback is just what generates the meter readings. The metering
              and the ledger are the product.
            </p>
          </Reveal>

          <div className="steps">
            <Reveal className="step" delay={0}>
              <div className="num">1</div>
              <h3>Top up a balance</h3>
              <p>
                Listeners keep a prepaid balance and stream anything. A live
                meter shows the cost ticking up as you play.
              </p>
              <div className="tick">→ prepaid, no flat subscription</div>
            </Reveal>
            <Reveal className="step" delay={120}>
              <div className="num">2</div>
              <h3>The meter ticks</h3>
              <p>
                Every ~45 seconds the player posts a forge-proof renew event —
                one metered billing record per minute, attributed to listener
                and rightsholder.
              </p>
              <div className="tick">→ POST /api/renew · the meter tick</div>
            </Reveal>
            <Reveal className="step" delay={240}>
              <div className="num">3</div>
              <h3>The ledger settles</h3>
              <p>
                Minutes reconcile into a royalty ledger that is the system of
                record — auditable per rightsholder, not a pooled estimate.
              </p>
              <div className="tick">→ system of record, not a guess</div>
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="lane" />

      {/* ---------------- WHO IT'S FOR ---------------- */}
      <section className="section" id="who">
        <div className="wrap">
          <Reveal className="sec-head">
            <span className="mono-label kicker amber">03 — Who it&apos;s for</span>
            <h2>One meter, three sides.</h2>
          </Reveal>

          <div className="cards">
            <Reveal className="card" delay={0}>
              <div className="ct">Listeners</div>
              <h3>Watch it tick</h3>
              <p>
                Top up, stream anything, pay only for minutes played — with a
                live per-minute meter as you listen.
              </p>
              <ul>
                <li>Prepaid balance, no flat fee</li>
                <li>HLS player with live cost meter</li>
                <li>Pay less when you listen less</li>
              </ul>
            </Reveal>
            <Reveal className="card" delay={120}>
              <div className="ct">Artists</div>
              <h3>Earn per minute heard</h3>
              <p>
                Set a per-minute rate and earn on actual consumption, settled to
                an auditable royalty statement.
              </p>
              <ul>
                <li>Set your own per-minute rate</li>
                <li>Paid for minutes actually played</li>
                <li>Royalty ledger, not a pool</li>
              </ul>
            </Reveal>
            <Reveal className="card" delay={240}>
              <div className="ct">Labels &amp; catalogs</div>
              <h3>Metering as infrastructure</h3>
              <p>
                Drop in a catalog and TollRoad becomes your per-rightsholder
                royalty-metering and billing layer.
              </p>
              <ul>
                <li>Per-rightsholder reconciliation</li>
                <li>Billing system-of-record</li>
                <li>Same engine, your catalog</li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="lane" />

      {/* ---------------- INFRA BAND ---------------- */}
      <section className="section" id="infra">
        <div className="wrap">
          <Reveal className="band">
            <div>
              <span className="mono-label kicker amber">
                04 — The bigger play
              </span>
              <h2 style={{ marginTop: 16 }}>
                <em>Stripe</em> for music royalties.
              </h2>
              <p>
                Usage-based billing won cloud, APIs and AI tokens. Music is the
                last big consumption medium still sold as flat all-you-can-eat
                with pooled payouts. TollRoad applies the solved pattern —
                metering at scale, reconciled into a billing system-of-record —
                to streaming.
              </p>
            </div>
            <a href="#start" className="btn btn-primary">
              Talk to us →
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CLOSER ---------------- */}
      <section className="closer" id="start">
        <div className="hero-bg" />
        <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
          <Reveal>
            <span className="mono-label amber">Start metering</span>
          </Reveal>
          <Reveal>
            <h2>
              Stop listening.
              <br />
              <em>Stop paying.</em>
            </h2>
          </Reveal>
          <Reveal className="hero-cta">
            <a href="#" className="btn btn-primary">
              Open a balance →
            </a>
            <a href="#" className="btn btn-ghost">
              Bring a catalog
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-inner">
            <div>
              <div className="brand">
                <BrandMark size={24} />
                TollRoad
              </div>
              <p className="fnote">
                The metered-billing DSP for music. Pay per minute played; earn
                per minute heard.
              </p>
            </div>
            <div className="footer-cols">
              <div className="footer-col">
                <h4>Product</h4>
                <a href="#how">How it works</a>
                <a href="#who">For listeners</a>
                <a href="#who">For artists</a>
                <a href="#infra">For labels</a>
              </div>
              <div className="footer-col">
                <h4>Company</h4>
                <a href="#">About</a>
                <a href="#">Manifesto</a>
                <a href="#">Careers</a>
              </div>
              <div className="footer-col">
                <h4>Legal</h4>
                <a href="#">Privacy</a>
                <a href="#">Terms</a>
                <a href="#">Royalty policy</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} TollRoad — every minute metered.</span>
            <span>Built on AWS · Hosted on Vercel</span>
          </div>
        </div>
      </footer>
    </>
  );
}
