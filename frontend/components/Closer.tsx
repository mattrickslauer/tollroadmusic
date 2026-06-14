import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

export default function Closer() {
  return (
    <section className="closer" id="start">
      <div className="hero-bg" />
      <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
        <Reveal>
          <h2>
            Pay less. <span className="serif">Hear more.</span>
          </h2>
        </Reveal>
        <Reveal className="hero-cta">
          <Cta href={ROUTES.browse}>I&apos;m a listener →</Cta>
          <Cta href={ROUTES.signup} variant="green">
            I&apos;m an artist →
          </Cta>
        </Reveal>
      </div>
    </section>
  );
}
