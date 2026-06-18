"use client";

import type { CatalogTrack, LibraryTrack } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { clock } from "./format";
import LikeButton from "./LikeButton";
import AddToPlaylist from "./AddToPlaylist";
import CoverImage from "./CoverImage";

interface Props {
  tracks: LibraryTrack[];
  /** Optional per-row remove action (e.g. remove from playlist / unlike list). */
  onRemove?: (trackId: string) => void;
  removeLabel?: string;
}

/** A dense, numbered list of tracks (Liked Songs, playlists). Rows dispatch
 *  play into the global player with the list as the queue. */
export default function TrackList({ tracks, onRemove, removeLabel = "Remove" }: Props) {
  const { current, playing, play } = usePlayer();
  if (tracks.length === 0) return <p className="lx-empty">Nothing here yet.</p>;

  const queue: CatalogTrack[] = tracks;

  return (
    <div className="lx-rows" role="list">
      <div className="lx-row lx-row-head" aria-hidden="true">
        <span className="lx-row-idx">#</span>
        <span className="lx-row-title">Title</span>
        <span className="lx-row-rate">Rate</span>
        <span className="lx-row-dur">Time</span>
        <span className="lx-row-actions" />
      </div>
      {tracks.map((t, i) => {
        const active = current?.id === t.id;
        const isPlaying = active && playing;
        return (
          <div key={t.id} className="lx-row" data-on={active} role="listitem">
            <button className="lx-row-idx" onClick={() => play(t, queue)} aria-label={`Play ${t.title}`}>
              <span className="lx-row-num">{i + 1}</span>
              <span className="lx-row-play">
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
                )}
              </span>
            </button>
            <button className="lx-row-title" onClick={() => play(t, queue)}>
              <CoverImage className="lx-row-cover" coverKey={t.coverImageKey} />
              <span className="lx-row-text">
                <span className="lx-row-name" title={t.title}>{t.title}</span>
                <span className="lx-row-artist">{t.artistName}</span>
              </span>
            </button>
            <span className="lx-row-rate">{t.pricePerMinuteCents}¢/min</span>
            <span className="lx-row-dur">{clock(t.durationSeconds)}</span>
            <span className="lx-row-actions">
              <LikeButton trackId={t.id} size={16} />
              <AddToPlaylist trackId={t.id} />
              {onRemove && (
                <button className="lx-row-remove" onClick={() => onRemove(t.id)} aria-label={removeLabel} title={removeLabel}>×</button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
