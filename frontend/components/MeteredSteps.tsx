import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import { IconWallet, IconMeter, IconLedger } from "@/components/Icons";

const STEPS: { icon: ReactNode; title: string; caption: string }[] = [
  { icon: <IconWallet />, title: "Top up", caption: "PREPAID BALANCE" },
  { icon: <IconMeter />, title: "Play", caption: "LIVE METER · PER MINUTE" },
  { icon: <IconLedger />, title: "Artists paid", caption: "AUDITABLE LEDGER" },
];

export default function MeteredSteps() {
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">Every minute metered</span>
          <h2>Like a utility, for music.</h2>
        </Reveal>

        <div className="chips">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} className="chip" delay={i * 120}>
              <div className="ico">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.caption}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
