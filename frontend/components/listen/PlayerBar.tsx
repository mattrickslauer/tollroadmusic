"use client";

import { useState } from "react";
import ArtistLink from "./ArtistLink";
import BondMeter from "@/components/bond/BondMeter";
import { usePlayer } from "@/context/PlayerProvider";
import { clock, usd } from "./format";
import LikeButton from "./LikeButton";
import CoverImage from "./CoverImage";
import FullscreenPlayer from "./FullscreenPlayer";
import VolumeControl from "./VolumeControl";
import { Sk } from "./Skeleton";

/** The persistent now-playing bar, lifted out of Catalog into the (listen)
 *  layout. It consumes the global player, so it stays live and docked across
 *  navigation. Shows the live meter: balance + this-session cost.
 *  Tapping the track info (or the expand button) opens the full-screen player —
 *  available at every width, not just phones. */
export default function PlayerBar() {
  const { current, playing, cur, dur, billedSec, balanceCents, balanceReady, toggle, seek, next, prev, hasNext, hasPrev, openTopUp } = usePlayer();
  const [expanded, setExpanded] = useState(false);

  const progress = dur ? Math.min(100, (cur / dur) * 100) : 0;
  const cost = current ? (billedSec / 60) * current.pricePerMinuteCents / 100 : 0;

  // Open the full-screen "now playing" view. Works at every width now: phones
  // tap the track info, desktop clicks the cover or the dedicated expand button.
  const expand = () => { if (current) setExpanded(true); };

  return (
    <footer className="lx-player" data-empty={!current}>
      <div
        className="lx-player-left"
        onClick={expand}
        role={current ? "button" : undefined}
        tabIndex={current ? 0 : undefined}
        aria-label={current ? "Open full-screen player" : undefined}
        onKeyDown={(e) => { if (current && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); expand(); } }}
      >
        {current ? (
          <>
            <CoverImage className="lx-player-cover" coverKey={current.coverImageKey} loading="eager" />
            <div className="lx-player-meta">
              <span className="lx-player-title" title={current.title}>{current.title}</span>
              <ArtistLink id={current.artistId} name={current.artistName} className="lx-player-artist" />
              {/* Live Superfan-Bond meter — ticks up as the metered minutes accrue. */}
              <BondMeter />
            </div>
            <LikeButton trackId={current.id} size={16} />
          </>
        ) : (
          <span className="lx-player-idle">Pick a track to start the meter.</span>
        )}
      </div>

      <div className="lx-player-center">
        <div className="lx-player-ctrls">
          <button className="lx-pctrl" onClick={prev} disabled={!hasPrev} aria-label="Previous">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 6v12H5V6zm12 0v12l-9-6z" /></svg>
          </button>
          <button className="lx-pctrl lx-pctrl-main" onClick={toggle} disabled={!current} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
            )}
          </button>
          <button className="lx-pctrl" onClick={next} disabled={!hasNext} aria-label="Next">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M17 6v12h2V6zM5 6v12l9-6z" /></svg>
          </button>
        </div>
        <div className="lx-player-seek">
          <span className="lx-player-t">{clock(cur)}</span>
          <div className="lx-player-track">
            <span className="lx-player-fill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={dur || 0}
              step="any"
              value={Math.min(cur, dur || 0)}
              disabled={!dur}
              aria-label={`Seek — ${clock(cur)} of ${clock(dur)}`}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>
          <span className="lx-player-t">{clock(dur)}</span>
        </div>
      </div>

      <div className="lx-player-right">
        <VolumeControl />
        <span className="lx-live" data-on={playing}><span className="lx-live-dot" />{playing ? "METERING" : "PAUSED"}</span>
        <button className="lx-meter" onClick={openTopUp} title="Add funds">
          <span className="lx-meter-bal" data-low={balanceReady && balanceCents <= 0}>
            {balanceReady ? usd(balanceCents) : <Sk h={15} w={48} radius={4} style={{ marginBottom: 3 }} />}
            <small>balance</small>
          </span>
          <span className="lx-meter-cost">${cost.toFixed(4)}<small>session</small></span>
        </button>
        <button className="lx-expand" onClick={expand} disabled={!current} aria-label="Open full-screen player" title="Full screen">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M4 20l6-6M20 4l-6 6" /></svg>
        </button>
      </div>

      <FullscreenPlayer open={expanded} onClose={() => setExpanded(false)} />
    </footer>
  );
}
