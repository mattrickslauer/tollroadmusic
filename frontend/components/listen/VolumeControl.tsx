"use client";

import { usePlayer } from "@/context/PlayerProvider";

/** Speaker icon — empty waves when muted, one wave at low volume, two when
 *  loud — so the glyph reads the current level at a glance. */
function VolIcon({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {level === 0 ? (
        <path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16.5 8.8a5 5 0 0 1 0 6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          {level > 0.5 && (
            <path d="M19.2 6.4a8.5 8.5 0 0 1 0 11.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  );
}

/** Output-volume control: a mute toggle plus an inline level slider, driven by
 *  the global player. Pure presentation over usePlayer() — no local state — so
 *  the bar and the full-screen view stay in lock-step. */
export default function VolumeControl({ className = "" }: { className?: string }) {
  const { volume, muted, setVolume, toggleMute } = usePlayer();
  const level = muted ? 0 : volume;
  const pct = Math.round(level * 100);

  return (
    <div className={`lx-volume ${className}`.trim()}>
      <button
        className="lx-vol-btn"
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        title={muted ? "Unmute" : "Mute"}
      >
        <VolIcon level={level} />
      </button>
      <div className="lx-vol-track">
        <span className="lx-vol-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={level}
          aria-label={`Volume — ${pct}%`}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
