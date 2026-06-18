"use client";

import type { CatalogTrack } from "@/lib/api/types";
import TrackCard from "./TrackCard";

/** A responsive grid of track tiles. The full list is passed as the play queue
 *  so next/prev + autoplay walk the grid. */
export default function TrackGrid({ tracks }: { tracks: CatalogTrack[] }) {
  if (tracks.length === 0) return <p className="lx-empty">No tracks match that.</p>;
  return (
    <div className="lx-grid">
      {tracks.map((t) => (
        <TrackCard key={t.id} track={t} queue={tracks} />
      ))}
    </div>
  );
}
