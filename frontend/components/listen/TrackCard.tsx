"use client";

import type { CatalogTrack } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { clock } from "./format";
import LikeButton from "./LikeButton";
import AddToPlaylist from "./AddToPlaylist";

/** A playable track tile for grids. Dispatches play into the global player
 *  (seeding the surrounding list as the queue), shows live EQ when active. */
export default function TrackCard({ track, queue }: { track: CatalogTrack; queue?: CatalogTrack[] }) {
  const { current, playing, play } = usePlayer();
  const active = current?.id === track.id;
  const isPlaying = active && playing;

  return (
    <article className="lx-card" data-on={active}>
      <button className="lx-card-cover" onClick={() => play(track, queue)} aria-label={`Play ${track.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={track.coverImageKey || "/covers/placeholder.svg"} alt="" loading="lazy" />
        <span className="lx-card-play">
          {isPlaying ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
          )}
        </span>
        {active && <span className="lx-eq" aria-hidden="true"><i /><i /><i /></span>}
      </button>
      <div className="lx-card-meta">
        <div className="lx-card-title" title={track.title}>{track.title}</div>
        <div className="lx-card-artist">{track.artistName}</div>
      </div>
      <div className="lx-card-foot">
        <LikeButton trackId={track.id} />
        <AddToPlaylist trackId={track.id} />
        <span className="lx-card-rate">{track.pricePerMinuteCents}¢/min</span>
        <span className="lx-card-dur">{clock(track.durationSeconds)}</span>
      </div>
    </article>
  );
}
