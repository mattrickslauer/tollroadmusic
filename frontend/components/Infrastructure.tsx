import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { IconWallet, IconMeter, IconLedger } from "@/components/Icons";
import { ROUTES } from "@/lib/routes";

const CARDS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <IconWallet />,
    title: "Agentic MCP DJ",
    body: "An AI agent describes a vibe, pays by the minute, and the music plays. The agent doesn't have a login — it has a wallet.",
  },
  {
    icon: <IconMeter />,
    title: "Embeddable player",
    body: "Drop the metered player into your own site or app — instant browser listening, no install.",
  },
  {
    icon: <IconLedger />,
    title: "Metered by the minute",
    body: "One API, paid per second of use. Real creators, direct-licensed.",
  },
];

/** Light infrastructure accent on the consumer landing page. */
export default function Infrastructure() {
  return (
    <section className="section infra" id="infra">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">Built as infrastructure</span>
          <h2>Any app, any agent.</h2>
        </Reveal>

        <div className="chips infra-grid">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} className="chip infra-card" delay={i * 120}>
              <div className="ico">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="infra-cta">
          <Cta href={ROUTES.developers} variant="ghost">
            For developers &amp; agents →
          </Cta>
        </Reveal>
      </div>
    </section>
  );
}
