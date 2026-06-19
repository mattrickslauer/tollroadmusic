"use client";

// First-run onboarding: three visual slides that sell the metered-listening
// model, ending with a one-time $3 (300-minute) welcome gift the listener
// claims on the last slide. Shown once after first sign-in (see PlayerProvider);
// the grant itself is idempotent server-side, so a double-claim is harmless.

import { useCallback, useEffect, useState } from "react";
import { claimOnboardingGift } from "@/lib/api/client";

interface Props {
  /** Dismiss without (further) action — the gift stays claimable next time. */
  onClose: () => void;
  /** Called with the new balance (cents) once the gift is credited. */
  onClaimed: (balanceCents: number) => void;
}

const SLIDES = [
  {
    key: "lane",
    eyebrow: "Welcome to TollRoad",
    title: (
      <>
        Music, metered <span className="onb-serif">by the minute.</span>
      </>
    ),
    body: "No subscription. No middleman. You pay only for the minutes you actually play — and nearly all of it goes straight to the artist.",
  },
  {
    key: "meter",
    eyebrow: "The meter",
    title: (
      <>
        You only pay for <span className="onb-serif">what you hear.</span>
      </>
    ),
    body: "Press play and the meter runs at about a penny a minute. Pause and it stops. Skip around freely — seeking is never billed.",
  },
  {
    key: "gift",
    eyebrow: "On the house",
    title: (
      <>
        Here&apos;s <span className="onb-serif">300 minutes</span>, free.
      </>
    ),
    body: "We've loaded $3 into your wallet to get you rolling — that's 300 minutes of listening at a penny a minute. Press play whenever you're ready.",
  },
];

/** The per-slide hero artwork. Pure CSS/SVG, animated for life. */
function Visual({ kind }: { kind: string }) {
  if (kind === "lane") {
    return (
      <div className="onb-visual onb-lane" aria-hidden="true">
        <div className="onb-lane-road" />
        <div className="onb-lane-sign">TOLL · 1¢/min</div>
      </div>
    );
  }
  if (kind === "meter") {
    return (
      <div className="onb-visual onb-meter" aria-hidden="true">
        <div className="onb-meter-head">
          <span className="onb-meter-live">● LIVE · METERING</span>
          <span className="onb-meter-rate">$0.01 / min</span>
        </div>
        <div className="onb-meter-track">
          <div className="onb-meter-fill" />
        </div>
        <div className="onb-meter-cost">$0.04</div>
      </div>
    );
  }
  return (
    <div className="onb-visual onb-gift" aria-hidden="true">
      <div className="onb-gift-glow" />
      <div className="onb-gift-amt">$3.00</div>
      <div className="onb-gift-min">300 minutes on us</div>
    </div>
  );
}

export default function OnboardingFlow({ onClose, onClaimed }: Props) {
  const [i, setI] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  // Esc dismisses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const claim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const { balanceCents } = await claimOnboardingGift();
      onClaimed(balanceCents);
    } catch {
      setError("Couldn't add your credit — you can still start listening.");
      setClaiming(false);
    }
  }, [claiming, onClaimed]);

  return (
    <div className="auth-overlay" onMouseDown={onClose}>
      <div
        className="auth-sheet onb-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to TollRoad"
      >
        <button className="auth-close" onClick={onClose} aria-label="Skip">×</button>

        <Visual kind={slide.key} />

        <div className="onb-body">
          <span className="onb-eyebrow">{slide.eyebrow}</span>
          <h2 className="onb-title">{slide.title}</h2>
          <p className="onb-sub">{slide.body}</p>
          {error && <p className="auth-error">{error}</p>}
        </div>

        <div className="onb-dots" role="tablist" aria-label="Slide">
          {SLIDES.map((s, n) => (
            <button
              key={s.key}
              className={`onb-dot${n === i ? " active" : ""}`}
              aria-label={`Go to slide ${n + 1}`}
              aria-selected={n === i}
              role="tab"
              onClick={() => setI(n)}
            />
          ))}
        </div>

        <div className="onb-nav">
          {i > 0 ? (
            <button className="auth-link" onClick={() => setI((n) => n - 1)} disabled={claiming}>
              ← Back
            </button>
          ) : (
            <button className="auth-link" onClick={onClose}>Skip</button>
          )}

          {last ? (
            <button className="btn btn-green onb-go" onClick={claim} disabled={claiming}>
              {claiming ? "Adding $3…" : "Claim 300 free minutes →"}
            </button>
          ) : (
            <button className="btn btn-primary onb-go" onClick={() => setI((n) => n + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
