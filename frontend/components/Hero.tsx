import Meter from "@/components/Meter";
import Cta from "@/components/Cta";
import { ROUTES, SECTIONS } from "@/lib/routes";

export default function Hero() {
  return (
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
            <Cta href={ROUTES.browse}>Open a balance →</Cta>
            <Cta href={SECTIONS.flow} variant="ghost">
              See how
            </Cta>
          </div>
        </div>

        <Meter />
      </div>
    </header>
  );
}
