// /search — filter-first view over the same catalog.
import SearchView from "@/components/listen/SearchView";
import { serverCatalog, apiConfigured } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const configured = apiConfigured();
  let catalog = null;
  if (configured) {
    try {
      catalog = await serverCatalog();
    } catch (e) {
      console.error("search: catalog load failed", e);
    }
  }

  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">Search</span>
        <h1 className="lx-h1">Find something to play.</h1>
      </header>
      {catalog ? <SearchView data={catalog} /> : <p className="lx-empty">Search isn&apos;t available right now.</p>}
    </>
  );
}
