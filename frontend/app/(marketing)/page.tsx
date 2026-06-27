// The landing page. SiteNav + SiteFooter now live in the (marketing) layout, so
// this is just the editorial content sections.
import Hero from "@/components/Hero";
import MiddlemanFlow from "@/components/MiddlemanFlow";
import Outcomes from "@/components/Outcomes";
import MeteredSteps from "@/components/MeteredSteps";
import DevStrip from "@/components/DevStrip";
import Infrastructure from "@/components/Infrastructure";
import Closer from "@/components/Closer";

export default function Home() {
  return (
    <>
      <Hero />
      <MiddlemanFlow />
      <hr className="lane" />
      <Outcomes />
      <hr className="lane" />
      <MeteredSteps />
      <DevStrip />
      <Infrastructure />
      <Closer />
    </>
  );
}
