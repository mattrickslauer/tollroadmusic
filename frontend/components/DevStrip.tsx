import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

/** Slim aside between the consumer sections and the infra section. */
export default function DevStrip() {
  return (
    <section className="dev-strip">
      <Reveal className="wrap dev-strip-inner">
        <p>
          <span className="mono-label amber">For developers &amp; agents</span>
          Building something? TollRoad is the metered-music layer — drop in a
          player or let an agent DJ.
        </p>
        <Cta href={ROUTES.developers} variant="ghost">
          Explore the platform →
        </Cta>
      </Reveal>
    </section>
  );
}
