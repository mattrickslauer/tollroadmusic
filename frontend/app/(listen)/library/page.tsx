"use client";

// /library — the listener's overview: a Liked Songs entry plus the playlist
// grid. Reads playlists from shared library state (kept in sync with the
// sidebar); the liked count loads from the API.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/context/LibraryProvider";
import PlaylistCard from "@/components/listen/PlaylistCard";
import { Sk, SkeletonPlaylistCard } from "@/components/listen/Skeleton";
import * as api from "@/lib/api/client";

export default function LibraryPage() {
  const { playlists, ready, createPlaylist } = useLibrary();
  const [likedCount, setLikedCount] = useState<number | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    api.getLikes().then((r) => setLikedCount(r.tracks.length)).catch(() => setLikedCount(0));
  }, []);

  async function create() {
    const n = name.trim();
    if (!n) return;
    await createPlaylist(n);
    setName("");
  }

  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">Your Library</span>
        <h1 className="lx-h1">Everything you&apos;ve saved.</h1>
      </header>

      <div className="lx-newpl">
        <input
          placeholder="New playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button onClick={create} disabled={!name.trim()}>Create playlist</button>
      </div>

      <div className="lx-grid">
        <Link href="/liked" className="lx-card lx-pcard lx-pcard-liked">
          <span className="lx-pcard-art lx-hero-liked" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.3-9.3-8.5C1.4 9.9 2.4 6.7 5.4 6c1.9-.4 3.6.6 4.6 2 1-1.4 2.7-2.4 4.6-2 3 .7 4 3.9 2.7 6.5C19 16.7 12 21 12 21z" /></svg>
          </span>
          <div className="lx-card-meta">
            <div className="lx-card-title">Liked Songs</div>
            <div className="lx-card-artist">
              {likedCount === null ? (
                <Sk h={11} w={56} radius={4} style={{ display: "inline-block", verticalAlign: "middle" }} />
              ) : (
                <>{likedCount} song{likedCount === 1 ? "" : "s"}</>
              )}
            </div>
          </div>
        </Link>
        {ready
          ? playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)
          : Array.from({ length: 5 }).map((_, i) => <SkeletonPlaylistCard key={i} />)}
      </div>
    </>
  );
}
