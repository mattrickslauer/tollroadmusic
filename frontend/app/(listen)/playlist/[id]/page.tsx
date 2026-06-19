"use client";

// /playlist/[id] — a single playlist: ordered, playable tracks with remove, a
// play-all into the queue, and delete. Reads/writes through the API client.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PlaylistDetail } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { useLibrary } from "@/context/LibraryProvider";
import TrackList from "@/components/listen/TrackList";
import { SkeletonHero, SkeletonTrackList } from "@/components/listen/Skeleton";
import * as api from "@/lib/api/client";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { play } = usePlayer();
  const { refreshPlaylists } = useLibrary();
  const [pl, setPl] = useState<PlaylistDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.getPlaylist(id).then(setPl).catch(() => setMissing(true));
  }, [id]);

  async function remove(trackId: string) {
    await api.removeFromPlaylist(id, trackId).catch(() => {});
    setPl((prev) => (prev ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== trackId) } : prev));
    refreshPlaylists();
  }

  async function del() {
    if (!confirm("Delete this playlist?")) return;
    await api.deletePlaylist(id).catch(() => {});
    refreshPlaylists();
    router.push("/library");
  }

  if (missing) return <p className="lx-empty">That playlist doesn&apos;t exist.</p>;
  if (!pl) {
    return (
      <>
        <SkeletonHero />
        <SkeletonTrackList />
      </>
    );
  }

  return (
    <>
      <header className="lx-head lx-head-hero">
        <span className="lx-hero-art" aria-hidden="true">{pl.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="lx-eyebrow">Playlist</span>
          <h1 className="lx-h1">{pl.name}</h1>
          <p className="lx-sub">{pl.tracks.length} song{pl.tracks.length === 1 ? "" : "s"}</p>
          <div className="lx-head-actions">
            {pl.tracks.length > 0 && <button className="lx-playall" onClick={() => play(pl.tracks[0], pl.tracks)}>▶ Play all</button>}
            <button className="lx-delete" onClick={del}>Delete playlist</button>
          </div>
        </div>
      </header>

      {pl.tracks.length === 0 ? (
        <p className="lx-empty">This playlist is empty — add tracks from the browse page.</p>
      ) : (
        <TrackList tracks={pl.tracks} onRemove={remove} removeLabel="Remove from playlist" />
      )}
    </>
  );
}
