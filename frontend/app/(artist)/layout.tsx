// (artist) — the rightsholder shell. Distinct from the dark listener app and
// the marketing brand: a focused, businesslike surface for sign-up + the
// royalty dashboard. Uses the brand chrome (warm), its own nav.
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import AuthButton from "@/components/AuthButton";
import "@/styles/artist.css";

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav az-nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <BrandMark />
            TollRoad
          </Link>
          <div className="nav-links">
            <Link href="/browse">Browse music</Link>
            <Link href="/artist">Dashboard</Link>
            <AuthButton />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
