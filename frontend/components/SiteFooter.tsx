import BrandMark from "@/components/BrandMark";
import { ROUTES, SECTIONS } from "@/lib/routes";

const FOOTER_LINKS = [
  { href: SECTIONS.flow, label: "How" },
  { href: ROUTES.browse, label: "Listeners" },
  { href: ROUTES.signup, label: "Artists" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "Terms" },
];

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <a href={SECTIONS.top} className="brand">
          <BrandMark size={24} />
          TollRoad
        </a>
        <div className="footer-links">
          {FOOTER_LINKS.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <span className="fnote">© {new Date().getFullYear()} TollRoad</span>
      </div>
    </footer>
  );
}
