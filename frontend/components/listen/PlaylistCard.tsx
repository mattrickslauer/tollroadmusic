"use client";

import Link from "next/link";
import type { PlaylistSummary } from "@/lib/api/types";

/** A playlist tile for the library grid. */
export default function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link href={`/playlist/${playlist.id}`} className="lx-card lx-pcard">
      <span className="lx-pcard-art" aria-hidden="true">
        {playlist.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="lx-card-meta">
        <div className="lx-card-title" title={playlist.name}>
          {playlist.name}
          {playlist.visibility === "public" && (
            <span className="lx-pub-badge" title="Public — shared via link" aria-label="Public">🌐</span>
          )}
        </div>
        <div className="lx-card-artist">{playlist.trackCount} track{playlist.trackCount === 1 ? "" : "s"}</div>
      </div>
    </Link>
  );
}
