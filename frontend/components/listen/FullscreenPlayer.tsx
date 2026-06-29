"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import ArtistLink from "./ArtistLink";
import { usePlayer } from "@/context/PlayerProvider";
import { clock, usdM } from "./format";
import LikeButton from "./LikeButton";
import CoverImage from "./CoverImage";
import RepeatButton from "./RepeatButton";
import VolumeControl from "./VolumeControl";
import { Sk } from "./Skeleton";

/** The expanded, full-screen "now playing" view — the immersive player you get
 *  by tapping the mini bar (phones) or the expand button (desktop). It consumes
 *  the same global player as PlayerBar, so play/pause/seek/volume stay in
 *  lock-step between the two. Available at every width; PlayerBar opens it. */
export default function FullscreenPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, playing, cur, dur, sessionCost, balanceMillicents, balanceReady, toggle, seek, next, prev, hasNext, hasPrev, repeatMode, cycleRepeat, openTopUp } = usePlayer();

  const progress = dur ? Math.min(100, (cur / dur) * 100) : 0;

  // Lock background scroll + close on Escape while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Nothing to show once the track clears out from under an open sheet.
  useEffect(() => { if (open && !current) onClose(); }, [open, current, onClose]);

  if (!open || !current) return null;

  // Portal to <body>: the player bar sets `backdrop-filter`, which makes it a
  // containing block for fixed-position descendants — left inside the footer,
  // this overlay's inset:0 resolves to the BAR's box (the bottom sliver), not
  // the viewport. Rendering at the body root frees it to fill the screen.
  return createPortal(
    <div className="app-dark lx-full" role="dialog" aria-modal="true" aria-label="Now playing">
      <header className="lx-full-top">
        <button className="lx-full-collapse" onClick={onClose} aria-label="Collapse player">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <span className="lx-full-eyebrow">Now Playing</span>
        <span className="lx-live" data-on={playing}><span className="lx-live-dot" />{playing ? "METERING" : "PAUSED"}</span>
      </header>

      <div className="lx-full-art">
        <CoverImage className="lx-full-cover" coverKey={current.coverImageKey} loading="eager" />
      </div>

      <div className="lx-full-body">
        <div className="lx-full-head">
          <div className="lx-full-meta">
            <h2 className="lx-full-title" title={current.title}>{current.title}</h2>
            <ArtistLink id={current.artistId} name={current.artistName} className="lx-full-artist" />
          </div>
          <LikeButton trackId={current.id} size={26} />
        </div>

        <div className="lx-full-seek">
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
          <div className="lx-full-times">
            <span>{clock(cur)}</span>
            <span>{clock(dur)}</span>
          </div>
        </div>

        <div className="lx-full-ctrls">
          <button className="lx-pctrl" onClick={prev} disabled={!hasPrev} aria-label="Previous">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 6v12H5V6zm12 0v12l-9-6z" /></svg>
          </button>
          <button className="lx-pctrl lx-pctrl-main lx-full-play" onClick={toggle} disabled={!current} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
            )}
          </button>
          <button className="lx-pctrl" onClick={next} disabled={!hasNext} aria-label="Next">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M17 6v12h2V6zM5 6v12l9-6z" /></svg>
          </button>
          <RepeatButton mode={repeatMode} onClick={cycleRepeat} disabled={!current} />
        </div>

        <VolumeControl className="lx-full-volume" />

        <button className="lx-meter lx-full-meter" onClick={openTopUp} title="Add funds">
          <span className="lx-meter-bal" data-low={balanceReady && balanceMillicents <= 0}>
            {balanceReady ? usdM(balanceMillicents) : <Sk h={17} w={56} radius={4} style={{ marginBottom: 3 }} />}
            <small>balance</small>
          </span>
          <span className="lx-meter-cost">${sessionCost.toFixed(4)}<small>session</small></span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
