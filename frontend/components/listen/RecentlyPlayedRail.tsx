"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CatalogTrack, LibraryTrack } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { ROUTES } from "@/lib/routes";
import * as api from "@/lib/api/client";
import CoverImage from "./CoverImage";
import { SkeletonRail } from "./Skeleton";

/** A horizontal rail of the listener's recently-played tracks, shown atop
 *  /browse. Refreshes when a new track starts so it stays current. */
export default function RecentlyPlayedRail() {
  const { current, play } = usePlayer();
  // null = still loading; [] = loaded but nothing to show.
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);

  useEffect(() => {
    const load = () => api.getRecents().then((r) => setTracks(r.tracks)).catch(() => setTracks([]));
    load();
    // Refresh when auth changes: a new sign-in has a different recents list, and
    // sign-out should drop the prior listener's history.
    const onSignedIn = () => load();
    const onSignedOut = () => setTracks([]);
    window.addEventListener("tollroad:signedin", onSignedIn);
    window.addEventListener("tollroad:signedout", onSignedOut);
    return () => {
      window.removeEventListener("tollroad:signedin", onSignedIn);
      window.removeEventListener("tollroad:signedout", onSignedOut);
    };
  }, [current?.id]);

  if (tracks === null) return <SkeletonRail />;
  if (tracks.length === 0) return null;
  const queue: CatalogTrack[] = tracks;

  return (
    <section className="lx-rail">
      <h2 className="lx-section-h">Recently played</h2>
      <div className="lx-rail-track">
        {tracks.map((t) => (
          <button key={t.id} className="lx-rail-item" onClick={() => play(t, queue)} title={`${t.title} — ${t.artistName}`}>
            <CoverImage coverKey={t.coverImageKey} />
            <span className="lx-rail-name">{t.title}</span>
            <Link className="lx-rail-artist" href={ROUTES.artistProfile(t.artistId)} onClick={(e) => e.stopPropagation()}>{t.artistName}</Link>
          </button>
        ))}
      </div>
    </section>
  );
}
