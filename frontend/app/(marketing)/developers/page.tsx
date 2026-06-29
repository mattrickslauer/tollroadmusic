import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Developers — TollRoad",
  description:
    "The metered-music layer for apps and agents. MCP server, embeddable player, paid per minute.",
};

const TOOL_LOOP = `# MCP server: tollroad-vibe-dj
search_music({ vibe: "tense final boss fight, 140 BPM synthwave" })
start_session({ context })
get_stream({ track_id })   # -> 402 Payment Required
charge(...)                # agent pays from its wallet
stream                     # signed, metered per minute`;

export default function DevelopersPage() {
  return (
    <main className="section dev-page">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">For developers &amp; agents</span>
          <h1>The metered-music layer for apps and agents.</h1>
          <p className="dev-lede">
            Real creators, direct-licensed, paid per second of use. Let an AI
            agent DJ over MCP, or drop the metered player into your own app —
            one backend, billed by the minute.
          </p>
        </Reveal>

        <Reveal className="dev-code">
          <pre>
            <code>{TOOL_LOOP}</code>
          </pre>
        </Reveal>

        <div className="dev-points">
          <Reveal className="dev-point">
            <h2>Agentic MCP DJ</h2>
            <p>
              The agent describes a vibe, gets ranked licensed tracks, and pays
              from its own wallet — no login, no checkout.
            </p>
          </Reveal>
          <Reveal className="dev-point" delay={100}>
            <h2>Embeddable player</h2>
            <p>
              Instant browser listening you can place anywhere. No install for
              your users.
            </p>
          </Reveal>
          <Reveal className="dev-point" delay={200}>
            <h2>Metered by the minute</h2>
            <p>
              Idempotent metering to the millicent, with an auditable royalty
              ledger behind every play.
            </p>
          </Reveal>
        </div>

        <Reveal className="hero-cta dev-cta">
          <Cta href={ROUTES.connect}>Connect Claude →</Cta>
          <Cta href="mailto:anthonybtedesco@gmail.com" variant="ghost">Get in touch →</Cta>
          <Cta href={ROUTES.browse} variant="ghost">
            Hear it live →
          </Cta>
        </Reveal>
      </div>
    </main>
  );
}
