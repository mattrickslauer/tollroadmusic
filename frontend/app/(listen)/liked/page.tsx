"use client";

// /liked — the listener's Liked Songs. Loads the liked tracks from the API and
// renders them as a playable list; unliking removes the row in place.
import { useEffect, useState } from "react";
import type { LibraryTrack } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { useLibrary } from "@/context/LibraryProvider";
import TrackList from "@/components/listen/TrackList";
import { SkeletonHero, SkeletonTrackList } from "@/components/listen/Skeleton";
import * as api from "@/lib/api/client";

export default function LikedPage() {
  const { play } = usePlayer();
  const { toggleLike } = useLibrary();
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);

  useEffect(() => {
    api.getLikes().then((r) => setTracks(r.tracks)).catch(() => setTracks([]));
  }, []);

  async function unlike(trackId: string) {
    await toggleLike(trackId);
    setTracks((prev) => (prev ? prev.filter((t) => t.id !== trackId) : prev));
  }

  // Still loading: show the page shell (hero + list) rather than real or fake data.
  if (tracks === null) {
    return (
      <>
        <SkeletonHero liked />
        <SkeletonTrackList />
      </>
    );
  }

  return (
    <>
      <header className="lx-head lx-head-hero">
        <span className="lx-hero-art lx-hero-liked" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.3-9.3-8.5C1.4 9.9 2.4 6.7 5.4 6c1.9-.4 3.6.6 4.6 2 1-1.4 2.7-2.4 4.6-2 3 .7 4 3.9 2.7 6.5C19 16.7 12 21 12 21z" /></svg>
        </span>
        <div>
          <span className="lx-eyebrow">Playlist</span>
          <h1 className="lx-h1">Liked Songs</h1>
          <p className="lx-sub">{tracks.length} song{tracks.length === 1 ? "" : "s"}</p>
          {tracks.length > 0 && (
            <button className="lx-playall" onClick={() => play(tracks[0], tracks)}>▶ Play all</button>
          )}
        </div>
      </header>

      {tracks.length === 0 ? (
        <p className="lx-empty">No liked songs yet — tap the heart on any track.</p>
      ) : (
        <TrackList tracks={tracks} onRemove={unlike} removeLabel="Remove from Liked Songs" />
      )}
    </>
  );
}
