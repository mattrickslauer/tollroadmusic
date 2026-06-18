"use client";

import { useEffect, useState } from "react";
import type { CatalogTrack, LibraryTrack } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import * as api from "@/lib/api/client";

/** A horizontal rail of the listener's recently-played tracks, shown atop
 *  /browse. Refreshes when a new track starts so it stays current. */
export default function RecentlyPlayedRail() {
  const { current, play } = usePlayer();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);

  useEffect(() => {
    api.getRecents().then((r) => setTracks(r.tracks)).catch(() => {});
  }, [current?.id]);

  if (tracks.length === 0) return null;
  const queue: CatalogTrack[] = tracks;

  return (
    <section className="lx-rail">
      <h2 className="lx-section-h">Recently played</h2>
      <div className="lx-rail-track">
        {tracks.map((t) => (
          <button key={t.id} className="lx-rail-item" onClick={() => play(t, queue)} title={`${t.title} — ${t.artistName}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.coverImageKey || "/covers/placeholder.svg"} alt="" loading="lazy" />
            <span className="lx-rail-name">{t.title}</span>
            <span className="lx-rail-artist">{t.artistName}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
