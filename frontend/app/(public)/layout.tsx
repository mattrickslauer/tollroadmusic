// (public) — standalone, anonymous landing pages for shared songs and artists.
// Deliberately NOT wrapped in the (listen) dark app shell or the marketing
// SiteNav: a stranger arriving from a texted link sees a clean, fast, branded
// card, not the full app chrome. Just a slim header + footer around the page.
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { ROUTES } from "@/lib/routes";
import "@/styles/share.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sh">
      <header className="sh-nav">
        <Link href="/" className="sh-brand">
          <BrandMark />
          TollRoad
        </Link>
        <Link href={ROUTES.browse} className="sh-nav-cta">
          Browse music
        </Link>
      </header>

      <main className="sh-main">{children}</main>

      <footer className="sh-foot">
        <span>Pay for the minutes you actually hear.</span>
        <Link href="/">What is TollRoad?</Link>
      </footer>
    </div>
  );
}
