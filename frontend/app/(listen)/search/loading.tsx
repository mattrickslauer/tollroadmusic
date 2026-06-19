// Shown while the /search server component fetches the catalog.
import { SkeletonFilters, SkeletonTrackGrid } from "@/components/listen/Skeleton";

export default function SearchLoading() {
  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">Search</span>
        <h1 className="lx-h1">Find something to play.</h1>
      </header>
      <SkeletonFilters />
      <SkeletonTrackGrid />
    </>
  );
}
