"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signature instrument — now metering a REAL track.
 * The bill accrues only while the song is actually playing, at the
 * track's per-minute rate. Tries to autoplay; falls back to the
 * play button when the browser blocks audible autoplay.
 */
const RATE_PER_MIN = 0.0011; // $/min — what the listener pays
const SRC = "/kanye-west/Kanye West - Stronger.mp3";
const TITLE = "Stronger";
const ARTIST = "Kanye West";

function clock(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function Meter() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [billedSec, setBilledSec] = useState(0); // metered seconds (cumulative)
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = 0.85;

    const onMeta = () => setDur(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);

    // attempt audible autoplay — may be blocked until first interaction
    a.play().catch(() => setPlaying(false));

    // smooth billing loop: accrue real elapsed playback time
    let last = a.currentTime;
    const id = window.setInterval(() => {
      if (a.paused) {
        last = a.currentTime;
        return;
      }
      const now = a.currentTime;
      const delta = now - last;
      last = now;
      if (delta > 0 && delta < 2) setBilledSec((b) => b + delta); // ignore seeks/loops
      setCur(now);
    }, 80);

    return () => {
      window.clearInterval(id);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const minutes = billedSec / 60;
  const cost = minutes * RATE_PER_MIN;
  const progress = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className="meter fade-up d3">
      <audio ref={audioRef} src={encodeURI(SRC)} preload="auto" loop />

      <div className="meter-head">
        <span className="live" data-on={playing}>
          <span className="dot" />
          {playing ? "LIVE · METERING" : "PAUSED"}
        </span>
        <button
          className="meter-btn"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="meter-readout">
        <span className="cur">$</span>
        {cost.toFixed(4)}
        <span className="unit">USD</span>
      </div>
      <div className="meter-sub">
        {TITLE} · {ARTIST} — {clock(cur)} / {clock(dur)}
      </div>

      <div className="meter-bar">
        <span className="fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="meter-split">
        <div className="meter-cell">
          <div className="k">Minutes billed</div>
          <div className="v">{minutes.toFixed(2)}</div>
        </div>
        <div className="meter-cell">
          <div className="k">Per minute</div>
          <div className="v">${RATE_PER_MIN.toFixed(4)}</div>
        </div>
      </div>
    </div>
  );
}
