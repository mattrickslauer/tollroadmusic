import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import AuthButton from "@/components/AuthButton";
import { ROUTES, SECTIONS } from "@/lib/routes";

const NAV_LINKS = [
  { href: SECTIONS.flow, label: "How" },
  { href: SECTIONS.outcomes, label: "Why" },
  { href: ROUTES.browse, label: "Browse music" },
  { href: ROUTES.signup, label: "For artists" },
];

export default function SiteNav() {
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <a href={SECTIONS.top} className="brand">
          <BrandMark />
          TollRoad
        </a>
        <div className="nav-links">
          {NAV_LINKS.map((link) =>
            // Hash anchors scroll the landing page; route links use <Link> so
            // entering the app is a client navigation and the global player
            // (audio + now-playing bar) survives instead of a full reload.
            link.href.startsWith("#") ? (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={link.href}>
                {link.label}
              </Link>
            ),
          )}
          <AuthButton />
        </div>
      </div>
    </nav>
  );
}
