"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signature instrument: a live taximeter for music.
 * Cost ticks up in real time at a per-minute rate while a track "plays".
 * Pauses when scrolled off-screen / tab hidden to stay honest about being live.
 */
const RATE_PER_MIN = 0.0011; // $/min — the artist's set rate
const TICK_MS = 60;
const TRACK_SECONDS = 214; // 3:34

export default function Meter() {
  const [seconds, setSeconds] = useState(11.2);
  const visible = useRef(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    let io: IntersectionObserver | undefined;
    if (el) {
      io = new IntersectionObserver(
        ([e]) => (visible.current = e.isIntersecting),
        { threshold: 0.2 }
      );
      io.observe(el);
    }

    const id = window.setInterval(() => {
      if (!visible.current || document.hidden) return;
      setSeconds((s) => (s >= TRACK_SECONDS ? 11.2 : s + TICK_MS / 1000));
    }, TICK_MS);

    return () => {
      window.clearInterval(id);
      io?.disconnect();
    };
  }, []);

  const minutes = seconds / 60;
  const cost = minutes * RATE_PER_MIN;
  const earned = cost * 0.7; // artist take of the metered minute
  const progress = Math.min(100, (seconds / TRACK_SECONDS) * 100);

  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="meter fade-up d3" ref={hostRef} aria-hidden="true">
      <div className="meter-head">
        <span className="live">
          <span className="dot" />
          LIVE · METERING
        </span>
        <span className="mono-label">$0.0011 / MIN</span>
      </div>

      <div className="meter-readout">
        <span className="cur">$</span>
        {cost.toFixed(4)}
        <span className="unit">USD</span>
      </div>
      <div className="meter-sub">
        Now playing — “Asphalt Lullaby” · {mm}:{ss}
      </div>

      <div className="meter-bar">
        <span className="fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="meter-split">
        <div className="meter-cell">
          <div className="k">Minutes played</div>
          <div className="v">{minutes.toFixed(2)}</div>
        </div>
        <div className="meter-cell">
          <div className="k green">Artist earned</div>
          <div className="v green">${earned.toFixed(4)}</div>
        </div>
      </div>
    </div>
  );
}
