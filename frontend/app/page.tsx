import Meter from "@/components/Meter";
import Reveal from "@/components/Reveal";
import BrandMark from "@/components/BrandMark";
import AuthButton from "@/components/AuthButton";
import {
  IconYou,
  IconPool,
  IconArtist,
  IconWallet,
  IconMeter,
  IconLedger,
} from "@/components/Icons";

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
            <a href="#flow">How</a>
            <a href="#outcomes">Why</a>
            <a href="/browse">Browse music</a>
            <a href="/signup">For artists</a>
            <AuthButton />
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
              <span className="mono-label">Music, metered by the minute</span>
            </span>

            <h1 className="hero-title fade-up d2">
              Consumers pay less.
              <br />
              Artists get paid <span className="serif">more.</span>
            </h1>

            <p className="hero-sub fade-up d2">
              No middleman. Just the minutes you play.
            </p>

            <div className="hero-cta fade-up d4">
              <a href="#start" className="btn btn-primary">
                Open a balance →
              </a>
              <a href="#flow" className="btn btn-ghost">
                See how
              </a>
            </div>
          </div>

          <Meter />
        </div>
      </header>

      {/* ---------------- FLOW: cut the middleman ---------------- */}
      <section className="section" id="flow">
        <div className="wrap">
          <Reveal className="sec-head">
            <span className="mono-label kicker amber">No middleman</span>
            <h2>Your money goes straight to the music.</h2>
          </Reveal>

          <Reveal className="flow">
            {/* old way */}
            <div className="flow-row old">
              <span className="tag">The old way</span>
              <div className="node you">
                <div className="ico">
                  <IconYou />
                </div>
                <span className="lbl">You</span>
                <span className="amt">$11.99</span>
              </div>
              <div className="track">
                <i className="coin" />
              </div>
              <div className="node mid">
                <div className="ico">
                  <IconPool />
                </div>
                <span className="lbl">Platform &amp; pool</span>
                <span className="amt">takes a cut</span>
              </div>
              <div className="track">
                <i className="coin shrink" />
              </div>
              <div className="node artist">
                <div className="ico">
                  <IconArtist />
                </div>
                <span className="lbl">Artist</span>
                <span className="amt">pennies</span>
              </div>
            </div>

            {/* tollroad way */}
            <div className="flow-row new">
              <span className="tag">TollRoad</span>
              <div className="node you">
                <div className="ico">
                  <IconYou />
                </div>
                <span className="lbl">You</span>
                <span className="amt">per minute</span>
              </div>
              <div className="track">
                <i className="coin" />
                <i className="coin c2" />
              </div>
              <div className="node artist">
                <div className="ico">
                  <IconArtist />
                </div>
                <span className="lbl">Artist</span>
                <span className="amt green">paid in full</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <hr className="lane" />

      {/* ---------------- OUTCOMES ---------------- */}
      <section className="section" id="outcomes">
        <div className="wrap">
          <div className="outcomes">
            <Reveal className="panel listener">
              <div>
                <div className="ct">For listeners</div>
                <h3>Pay for what you hear.</h3>
                <p>Roughly a third less than a flat plan. Stop listening, stop paying.</p>
              </div>
              <div className="compare">
                <div className="bar old">
                  <span className="price">$11.99</span>
                  <span className="col" />
                  <span className="cap">flat plan</span>
                </div>
                <div className="bar new">
                  <span className="price">~$8</span>
                  <span className="col" />
                  <span className="cap">metered</span>
                </div>
              </div>
            </Reveal>

            <Reveal className="panel artist" delay={120}>
              <div>
                <div className="ct">For artists</div>
                <h3>Earn on every minute.</h3>
                <p>Set your rate. Get paid for minutes actually played — not a shrinking pool.</p>
              </div>
              <div className="eq" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="lane" />

      {/* ---------------- EVERY MINUTE METERED ---------------- */}
      <section className="section">
        <div className="wrap">
          <Reveal className="sec-head">
            <span className="mono-label kicker amber">Every minute metered</span>
            <h2>Like a utility, for music.</h2>
          </Reveal>

          <div className="chips">
            <Reveal className="chip" delay={0}>
              <div className="ico">
                <IconWallet />
              </div>
              <h3>Top up</h3>
              <p>PREPAID BALANCE</p>
            </Reveal>
            <Reveal className="chip" delay={120}>
              <div className="ico">
                <IconMeter />
              </div>
              <h3>Play</h3>
              <p>LIVE METER · PER MINUTE</p>
            </Reveal>
            <Reveal className="chip" delay={240}>
              <div className="ico">
                <IconLedger />
              </div>
              <h3>Artists paid</h3>
              <p>AUDITABLE LEDGER</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- CLOSER ---------------- */}
      <section className="closer" id="start">
        <div className="hero-bg" />
        <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
          <Reveal>
            <h2>
              Pay less. <span className="serif">Hear more.</span>
            </h2>
          </Reveal>
          <Reveal className="hero-cta">
            <a href="#" className="btn btn-primary">
              Open a balance →
            </a>
            <a href="/signup" className="btn btn-ghost">
              Bring a catalog
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="footer">
        <div className="wrap footer-inner">
          <a href="#top" className="brand">
            <BrandMark size={24} />
            TollRoad
          </a>
          <div className="footer-links">
            <a href="#flow">How</a>
            <a href="#outcomes">Listeners</a>
            <a href="#outcomes">Artists</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <span className="fnote">© {new Date().getFullYear()} TollRoad</span>
        </div>
      </footer>
    </>
  );
}
