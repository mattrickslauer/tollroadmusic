import Reveal from "@/components/Reveal";

export default function Outcomes() {
  return (
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
  );
}
