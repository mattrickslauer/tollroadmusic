// (marketing) — the public, warm editorial brand. Its own chrome (SiteNav +
// SiteFooter) wraps every marketing page. Distinct from the dark (listen) app
// and the (artist) shell; URLs are unchanged by the route group.
import "@/styles/landing.css";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      {children}
      <SiteFooter />
    </>
  );
}
