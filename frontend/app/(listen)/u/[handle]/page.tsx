import BondWall from "@/components/bond/BondWall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public fan profile — the shareable "wall of bonds" at /u/<handle>. Mirrors the
 *  sibling artists/[slug] page (server component, awaits params) but the bond data
 *  is fetched client-side by <BondWall> through the same-origin /api/v1 proxy, so
 *  the wall owns its own loading / not-found / empty states. */
export default async function FanProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <BondWall handle={handle} />;
}
