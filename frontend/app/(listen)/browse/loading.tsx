// Shown while the /browse server component fetches the catalog. Mirrors the
// page's header + body (rail, filters, grid) as loading shells — no fake data.
import { SkeletonRail, SkeletonFilters, SkeletonTrackGrid } from "@/components/listen/Skeleton";

export default function BrowseLoading() {
  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">The catalog</span>
        <h1 className="lx-h1">Independent music, metered by the minute.</h1>
        <p className="lx-sub">Press play on anything. The meter bills only while a track is actually playing, at its per-minute rate.</p>
      </header>
      <SkeletonRail />
      <SkeletonFilters />
      <SkeletonTrackGrid />
    </>
  );
}
