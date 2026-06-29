"use client";

// Vibe Pad state — the thin owner of one in-flight mood trace.
//
// It holds the buffered samples for the current song (grid-aligned parallel
// arrays in refs, so high-frequency writes never re-render), the submit call,
// and the reward result + crowd consensus state. The capture UI (MoodPad) reads
// the live player and drives writeSample()/submit(); this provider just keeps
// the buffer and talks to the API. Mounted inside PlayerProvider (GlobalPlayer)
// so MoodPad — rendered in FullscreenPlayer's portal — can use both hooks.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import * as api from "@/lib/api/client";
import type { MoodConsensus, MoodTraceResult } from "@/lib/api/types";

/** Sampling grid: one bin every 250ms (matches the backend's array index). */
export const GRID_MS = 250;

export interface MoodState {
  gridMs: number;
  /** Allocate (or re-use) a null-filled buffer for this song + duration. */
  ensureSession: (songId: string, durationMs: number) => void;
  /** Write a sample at a time bin. `null` v/e marks a gap (puck released). */
  writeSample: (bin: number, v: number | null, e: number | null) => void;
  /** Fraction of bins with a real sample (0–1) — live coverage for the UI. */
  coverage: () => number;
  /** Submit the buffered trace once; idempotent per session. */
  submit: () => Promise<void>;
  submitting: boolean;
  /** The reward result, once the submit resolves. */
  result: MoodTraceResult | null;
  /** True when the submit failed (e.g. endpoint not live yet) — degrade to a
   *  plain "thanks" instead of a reward reveal; the read is still captured. */
  failed: boolean;
  /** Crowd consensus for the current song (the faint ghost trail), if any. */
  consensus: MoodConsensus | null;
  loadConsensus: (songId: string) => void;
  /** Clear the result/failed/consensus state for a fresh run. */
  reset: () => void;
}

const Ctx = createContext<MoodState | null>(null);

export function useMood(): MoodState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMood must be used within <MoodProvider>");
  return ctx;
}

export default function MoodProvider({ children }: { children: React.ReactNode }) {
  // Live session buffer — refs so the 4Hz sample writes don't re-render the app.
  const songIdRef = useRef<string | null>(null);
  const durationMsRef = useRef(0);
  const vRef = useRef<(number | null)[]>([]);
  const eRef = useRef<(number | null)[]>([]);
  const submittedRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MoodTraceResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [consensus, setConsensus] = useState<MoodConsensus | null>(null);

  const ensureSession = useCallback((songId: string, durationMs: number) => {
    const len = Math.max(1, Math.ceil(durationMs / GRID_MS));
    // Re-allocate only when the song or its length actually changes, so an
    // in-progress capture isn't wiped by an incidental re-render.
    if (songIdRef.current === songId && vRef.current.length === len) return;
    songIdRef.current = songId;
    durationMsRef.current = durationMs;
    vRef.current = new Array(len).fill(null);
    eRef.current = new Array(len).fill(null);
    submittedRef.current = false;
    setResult(null);
    setFailed(false);
  }, []);

  const writeSample = useCallback((bin: number, v: number | null, e: number | null) => {
    const arr = vRef.current;
    if (bin < 0 || bin >= arr.length) return;
    arr[bin] = v;
    eRef.current[bin] = e;
  }, []);

  const coverage = useCallback(() => {
    const arr = vRef.current;
    if (arr.length === 0) return 0;
    let n = 0;
    for (const x of arr) if (x !== null) n++;
    return n / arr.length;
  }, []);

  const submit = useCallback(async () => {
    if (submittedRef.current || !songIdRef.current) return;
    submittedRef.current = true; // claim the slot before the await (no double-submit)
    setSubmitting(true);
    try {
      const res = await api.postMoodTrace({
        songId: songIdRef.current,
        gridMs: GRID_MS,
        durationMs: durationMsRef.current,
        samples: { v: vRef.current.slice(), e: eRef.current.slice() },
      });
      setResult(res);
      // Mirror the credited balance into the player's wallet display.
      if (typeof res.newBalanceMillicents === "number") {
        window.dispatchEvent(
          new CustomEvent("tollroad:balance", { detail: { balanceMillicents: res.newBalanceMillicents } }),
        );
      }
    } catch {
      // Endpoint may not be live yet — don't block the UI; show a thanks state.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }, []);

  const loadConsensus = useCallback((songId: string) => {
    setConsensus(null);
    api
      .getMoodConsensus(songId)
      .then((c) => setConsensus(c))
      .catch(() => setConsensus(null)); // nice-to-have — stay silent if absent
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setFailed(false);
    setConsensus(null);
    submittedRef.current = false;
  }, []);

  const value = useMemo<MoodState>(
    () => ({
      gridMs: GRID_MS,
      ensureSession,
      writeSample,
      coverage,
      submit,
      submitting,
      result,
      failed,
      consensus,
      loadConsensus,
      reset,
    }),
    [ensureSession, writeSample, coverage, submit, submitting, result, failed, consensus, loadConsensus, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
