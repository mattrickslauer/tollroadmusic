// /browse — the public catalog. Reads artists + tracks from DSQL and renders a
// playable grid with a live metering bar. Server component: data is fetched on
// the server, the interactive grid hydrates on the client.

import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import Catalog from "@/components/Catalog";
import { getCatalog } from "@/lib/catalog";
import { dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const configured = dsqlConfigured();
  let catalog = null;
  let error: string | null = null;
  if (configured) {
    try {
      catalog = await getCatalog();
    } catch (e) {
      console.error("browse: catalog load failed", e);
      error = "Could not load the catalog right now.";
    }
  }

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <BrandMark />
            TollRoad
          </Link>
          <div className="nav-links">
            <Link href="/">Home</Link>
            <Link href="/signup">For artists</Link>
            <Link href="/browse" className="btn btn-primary">Browse music →</Link>
          </div>
        </div>
      </nav>

      <header className="cat-head">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /><span className="mono-label">The catalog</span></span>
          <h1 className="cat-h1">Independent music, <span className="serif">metered by the minute.</span></h1>
          <p className="cat-sub">Press play on anything. The meter bills only while a track is actually playing, at its per-minute rate.</p>
        </div>
      </header>

      <main className="wrap cat-main">
        {!configured && (
          <p className="cat-empty">Catalog isn&apos;t configured yet — set <code>TOLLROAD_DSQL_ENDPOINT</code> and seed the demo.</p>
        )}
        {error && <p className="cat-empty">{error}</p>}
        {catalog && <Catalog data={catalog} />}
      </main>
    </>
  );
}
