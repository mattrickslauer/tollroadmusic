import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import MiddlemanFlow from "@/components/MiddlemanFlow";
import Outcomes from "@/components/Outcomes";
import MeteredSteps from "@/components/MeteredSteps";
import Closer from "@/components/Closer";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <SiteNav />
      <Hero />
      <MiddlemanFlow />
      <hr className="lane" />
      <Outcomes />
      <hr className="lane" />
      <MeteredSteps />
      <Closer />
      <SiteFooter />
    </>
  );
}
