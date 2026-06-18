// /browse — the catalog. Server component: fetches artists + tracks from the
// backend API (server→server). The interactive grid + recently-played rail
// hydrate on the client and dispatch playback into the global player.
import BrowseView from "@/components/listen/BrowseView";
import { serverCatalog, apiConfigured } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const configured = apiConfigured();
  let catalog = null;
  let error: string | null = null;
  if (configured) {
    try {
      catalog = await serverCatalog();
    } catch (e) {
      console.error("browse: catalog load failed", e);
      error = "Could not load the catalog right now.";
    }
  }

  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">The catalog</span>
        <h1 className="lx-h1">Independent music, metered by the minute.</h1>
        <p className="lx-sub">Press play on anything. The meter bills only while a track is actually playing, at its per-minute rate.</p>
      </header>

      {!configured && (
        <p className="lx-empty">Catalog isn&apos;t configured yet — set <code>TOLLROAD_API_BASE</code> to the backend and seed the demo.</p>
      )}
      {error && <p className="lx-empty">{error}</p>}
      {catalog && <BrowseView data={catalog} />}
    </>
  );
}
