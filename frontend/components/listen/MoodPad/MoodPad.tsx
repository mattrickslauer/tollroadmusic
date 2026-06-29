"use client";

// The Vibe Pad — a mood-tagging mini-game laid over the now-playing screen.
//
// While a song plays you drag a puck around a valence×energy field to "set the
// tone" of each moment. Position maps to v,e ∈ [-1,1] (X = valence, Y = energy).
// Every 250ms, when the song is playing AND the puck is held, the puck position
// is snapped into a grid-aligned bin (bin = floor(currentMs / 250)); released =
// a gap (null). On song end (or Done) the whole trace is submitted and a reward
// is revealed. Pointer Events cover mouse + touch; `touch-action: none` on the
// pad lets a finger drag without scrolling the page.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerProvider";
import { useMood, GRID_MS } from "@/context/MoodProvider";
import styles from "./MoodPad.module.css";

/** Pad coords (x,y ∈ [0,1], origin top-left) → mood (v,e ∈ [-1,1]). */
function toMood(x: number, y: number): { v: number; e: number } {
  return { v: x * 2 - 1, e: 1 - y * 2 };
}
/** Mood (v,e ∈ [-1,1]) → pad coords as percentages (origin top-left). */
function toPct(v: number, e: number): { left: number; top: number } {
  return { left: ((v + 1) / 2) * 100, top: ((1 - e) / 2) * 100 };
}
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export default function MoodPad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, cur, dur, playing } = usePlayer();
  const { ensureSession, writeSample, coverage, submit, submitting, result, failed, consensus, loadConsensus, reset } =
    useMood();

  const padRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 }); // puck position, pad coords
  const [held, setHeld] = useState(false);

  // Refs the 4Hz sampler reads, so it never has to be re-created as cur/pos/held
  // change (which would reset its cadence). Assigned every render — cheap + safe.
  const posRef = useRef(pos);
  posRef.current = pos;
  const heldRef = useRef(held);
  heldRef.current = held;
  const curMsRef = useRef(0);
  curMsRef.current = cur * 1000;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const durationMs = Math.round(dur * 1000);

  // Bind the buffer to this song + duration and pull its crowd ghost. The
  // cleanup submits the outgoing trace (on track change or close) if it has any
  // signal — natural song-end advances the player, which trips this too.
  useEffect(() => {
    if (!open || !current || durationMs <= 0) return;
    ensureSession(current.id, durationMs);
    loadConsensus(current.id);
    return () => {
      if (coverage() > 0) submit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, durationMs]);

  // The sampler: one tick per grid bin while the overlay is open. Held → record
  // the puck; playing-but-released → an explicit gap; paused → don't advance.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      if (!playingRef.current) return;
      const bin = Math.floor(curMsRef.current / GRID_MS);
      if (heldRef.current) {
        const { v, e } = toMood(posRef.current.x, posRef.current.y);
        writeSample(bin, v, e);
      } else {
        writeSample(bin, null, null);
      }
    }, GRID_MS);
    return () => window.clearInterval(id);
  }, [open, writeSample]);

  // Best-effort auto-submit as playback reaches the very end (in case the track
  // doesn't switch out from under us). Idempotent in the provider.
  useEffect(() => {
    if (!open || dur <= 0) return;
    if (cur >= dur - 0.4) submit();
  }, [open, cur, dur, submit]);

  const updateFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (result || submitting) return; // pad is locked once the reveal is up
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHeld(true);
    updateFromEvent(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!heldRef.current) return;
    updateFromEvent(e.clientX, e.clientY);
  };
  const endHold = () => setHeld(false);

  if (!open) return null;

  const puck = pos; // pad coords
  const mood = toMood(puck.x, puck.y);
  const revealing = submitting || result !== null || failed;

  // Crowd ghost: faint consensus path + a dot at the current bin (if available).
  const ghostPts: { left: number; top: number }[] = [];
  let ghostNow: { left: number; top: number } | null = null;
  if (consensus?.consensus) {
    const { v, e } = consensus.consensus;
    const nowBin = Math.floor((cur * 1000) / GRID_MS);
    for (let i = 0; i < v.length; i++) {
      const vv = v[i];
      const ee = e[i];
      if (vv == null || ee == null) continue;
      const p = toPct(vv, ee);
      ghostPts.push(p);
      if (i === nowBin) ghostNow = p;
    }
  }
  const ghostPoly = ghostPts.map((p) => `${p.left},${p.top}`).join(" ");

  const cov = Math.round(coverage() * 100);

  return (
    <div className={`app-dark ${styles.overlay}`} role="dialog" aria-modal="true" aria-label="Set the tone">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <div>
            <span className={styles.eyebrow}>Vibe Pad</span>
            <h2 className={styles.title}>Set the tone</h2>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <p className={styles.hint}>
          {revealing ? "Reading saved." : "Hold and drag the puck to follow the feeling as the song plays."}
        </p>

        <div className={styles.padWrap}>
          {/* Axis captions */}
          <span className={`${styles.axis} ${styles.axisTop}`}>Energetic</span>
          <span className={`${styles.axis} ${styles.axisBottom}`}>Calm</span>
          <span className={`${styles.axis} ${styles.axisLeft}`}>Negative</span>
          <span className={`${styles.axis} ${styles.axisRight}`}>Positive</span>

          <div
            ref={padRef}
            className={styles.pad}
            data-held={held}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onLostPointerCapture={endHold}
          >
            <span className={`${styles.quad} ${styles.qHype}`}>Hype</span>
            <span className={`${styles.quad} ${styles.qTense}`}>Tense</span>
            <span className={`${styles.quad} ${styles.qSad}`}>Sad</span>
            <span className={`${styles.quad} ${styles.qChill}`}>Chill</span>

            <svg className={styles.field} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="50" y1="0" x2="50" y2="100" className={styles.cross} />
              <line x1="0" y1="50" x2="100" y2="50" className={styles.cross} />
              {ghostPts.length > 1 && <polyline points={ghostPoly} className={styles.ghostPath} />}
              {ghostNow && <circle cx={ghostNow.left} cy={ghostNow.top} r="3.2" className={styles.ghostNow} />}
            </svg>

            <span
              className={styles.puck}
              data-held={held}
              style={{ left: `${puck.x * 100}%`, top: `${puck.y * 100}%` }}
            />
          </div>
        </div>

        {!revealing && (
          <div className={styles.foot}>
            <div className={styles.readout}>
              <span className={styles.readoutVal}>{cov}%</span>
              <small>covered</small>
            </div>
            <div className={styles.readout}>
              <span className={styles.readoutVal}>
                {mood.v >= 0 ? "+" : ""}{mood.v.toFixed(2)} · {mood.e >= 0 ? "+" : ""}{mood.e.toFixed(2)}
              </span>
              <small>valence · energy</small>
            </div>
            <button className={`btn btn-primary ${styles.done}`} onClick={() => submit()} disabled={cov === 0}>
              Done
            </button>
          </div>
        )}

        {revealing && (
          <Reveal
            submitting={submitting}
            failed={failed}
            result={result}
            consensusCount={consensus?.traceCount ?? null}
            onAgain={() => { reset(); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

function Reveal({
  submitting,
  failed,
  result,
  consensusCount,
  onAgain,
}: {
  submitting: boolean;
  failed: boolean;
  result: import("@/lib/api/types").MoodTraceResult | null;
  consensusCount: number | null;
  onAgain: () => void;
}) {
  if (submitting && !result) {
    return (
      <div className={styles.reveal}>
        <span className={styles.revealSpin} aria-hidden="true" />
        <p className={styles.revealSub}>Scoring your read against the crowd…</p>
      </div>
    );
  }
  if (failed || !result) {
    return (
      <div className={styles.reveal}>
        <div className={styles.revealCheck}>✓</div>
        <h3 className={styles.revealHead}>Thanks — your read is saved.</h3>
        <p className={styles.revealSub}>We&apos;ll fold it into this song&apos;s crowd vibe.</p>
        <button className="btn btn-ghost" onClick={onAgain}>Done</button>
      </div>
    );
  }

  const mins = result.rewardMinutes;
  const minsStr = `+${mins.toFixed(mins < 10 ? 1 : 0)} min`;
  const agree = result.agreement;

  return (
    <div className={styles.reveal}>
      <div className={styles.revealCheck}>♪</div>
      <h3 className={styles.revealHead}>{minsStr} earned</h3>
      <p className={styles.revealSub}>
        {result.alreadyRewarded
          ? "Already counted for this song — your read was updated."
          : result.bootstrap
            ? "First reactions in — full credit."
            : agree != null
              ? `${Math.round(agree * 100)}% in tune with the crowd`
              : "Logged to the crowd vibe."}
      </p>
      {!result.bootstrap && agree != null && (
        <div className={styles.tuneBar}>
          <span className={styles.tuneFill} style={{ width: `${Math.round(Math.max(0, Math.min(1, agree)) * 100)}%` }} />
        </div>
      )}
      <p className={styles.revealMeta}>
        {Math.round(result.coveragePct * 100)}% covered
        {consensusCount != null ? ` · ${consensusCount} listener${consensusCount === 1 ? "" : "s"} so far` : ""}
      </p>
      <button className="btn btn-primary" onClick={onAgain}>Nice</button>
    </div>
  );
}
