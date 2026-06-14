import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import { IconYou, IconPool, IconArtist } from "@/components/Icons";

function FlowNode({
  role,
  icon,
  label,
  amount,
  amountClass = "",
}: {
  role: string;
  icon: ReactNode;
  label: string;
  amount: string;
  amountClass?: string;
}) {
  return (
    <div className={`node ${role}`}>
      <div className="ico">{icon}</div>
      <span className="lbl">{label}</span>
      <span className={`amt${amountClass ? ` ${amountClass}` : ""}`}>{amount}</span>
    </div>
  );
}

export default function MiddlemanFlow() {
  return (
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
            <FlowNode role="you" icon={<IconYou />} label="You" amount="$11.99" />
            <div className="track">
              <i className="coin" />
            </div>
            <FlowNode
              role="mid"
              icon={<IconPool />}
              label="Platform & pool"
              amount="takes a cut"
            />
            <div className="track">
              <i className="coin shrink" />
            </div>
            <FlowNode role="artist" icon={<IconArtist />} label="Artist" amount="pennies" />
          </div>

          {/* tollroad way */}
          <div className="flow-row new">
            <span className="tag">TollRoad</span>
            <FlowNode role="you" icon={<IconYou />} label="You" amount="per minute" />
            <div className="track">
              <i className="coin" />
              <i className="coin c2" />
            </div>
            <FlowNode
              role="artist"
              icon={<IconArtist />}
              label="Artist"
              amount="paid in full"
              amountClass="green"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
