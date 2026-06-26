"use client";

// The dopamine moment. Subscribes to tier-up events emitted by BondProvider when
// the listener crosses into a new Superfan-Bond tier mid-listen, and rewards them
// with a brief, premium celebration toast: the new tier badge, a CSS confetti
// burst, and a glow. Auto-dismisses after ~4s, is manually closeable, and queues
// multiple tier-ups so they play one at a time rather than stacking into noise.
// Pure CSS animation, and it respects prefers-reduced-motion (handled in the CSS).

import { useEffect, useRef, useState } from "react";
import { useBond, type TierUpEvent } from "@/context/BondProvider";

interface QueuedTierUp extends TierUpEvent {
  key: number; // stable id so React keys + the dismiss timer track one toast.
}

const DISMISS_MS = 4000;
const PARTICLE_COUNT = 16;

// Pre-computed confetti geometry — each particle flies out at its own angle /
// distance / delay. Stable across renders so the burst doesn't reshuffle.
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (360 / PARTICLE_COUNT) * i + (i % 2 ? 11 : -7);
  const dist = 46 + ((i * 37) % 34);
  return {
    "--lx-ang": `${angle}deg`,
    "--lx-dist": `${dist}px`,
    "--lx-delay": `${(i % 5) * 30}ms`,
    "--lx-hue": i % 3, // selects one of three tier-accent colours in CSS
  } as React.CSSProperties;
});

export default function TierUpCelebration() {
  const { subscribeTierUp } = useBond();
  const [queue, setQueue] = useState<QueuedTierUp[]>([]);
  const idRef = useRef(0);

  // Subscribe once; every tier-up lands at the back of the queue.
  useEffect(() => {
    const unsub = subscribeTierUp((e) => {
      setQueue((q) => [...q, { ...e, key: ++idRef.current }]);
    });
    return unsub;
  }, [subscribeTierUp]);

  const current = queue[0];

  // Auto-dismiss the visible toast; re-armed whenever the head of the queue changes.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), DISMISS_MS);
    return () => clearTimeout(t);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  const dismiss = () => setQueue((q) => q.slice(1));
  const remaining = queue.length - 1;

  return (
    <div className="lx-tierup-layer" aria-live="polite">
      {/* key forces a fresh mount per tier-up so the scale-in + burst replay. */}
      <div key={current.key} className="lx-tierup" data-tier={current.tier} role="status">
        <div className="lx-tierup-burst" aria-hidden="true">
          {PARTICLES.map((style, i) => (
            <span key={i} className="lx-tierup-particle" style={style} />
          ))}
        </div>

        <div className="lx-tierup-badge" aria-hidden="true">
          <span className="lx-tierup-badge-tier">{current.tier}</span>
        </div>

        <div className="lx-tierup-copy">
          <span className="lx-tierup-kicker">Tier unlocked</span>
          <span className="lx-tierup-headline">
            You reached <strong>{current.tier}</strong>
            {current.artistName ? <> with <strong>{current.artistName}</strong></> : null}!
          </span>
          {remaining > 0 ? (
            <span className="lx-tierup-more">+{remaining} more</span>
          ) : null}
        </div>

        <button className="lx-tierup-close" onClick={dismiss} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <span className="lx-tierup-progress" aria-hidden="true" />
      </div>
    </div>
  );
}
