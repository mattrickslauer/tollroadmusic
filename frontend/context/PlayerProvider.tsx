"use client";

// The global, persistent player. Everything about playback + metering that used
// to live inside Catalog.tsx now lives here, mounted once in the (listen) layout
// so the <audio> element and the meter survive navigation between listener pages.
//
// The metering contract is preserved byte-for-byte from the original Catalog:
//   • 100ms loop accrues real elapsed playback only (never seeks/scrubs/loops)
//   • seeking gates the meter so jumped time is free
//   • the first minute is prepaid in beginPlay; each subsequent whole minute is
//     charged as it's crossed; a 402 pauses playback and opens the top-up sheet
// Demo-critical — do not "improve" the cadence; it's the product.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogTrack } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { fetchMe } from "@/lib/auth";
import SignInSheet from "@/components/SignInSheet";
import TopUpSheet from "@/components/TopUpSheet";
import OnboardingFlow from "@/components/OnboardingFlow";

// Once a listener skips onboarding in this tab session we don't re-pop it on
// every navigation; the gift stays claimable and re-offers on a fresh session
// until claimed (the server flag is the source of truth).
const ONB_SKIP_KEY = "tollroad_onb_skip";
function onbDismissed(): boolean {
  try { return sessionStorage.getItem(ONB_SKIP_KEY) === "1"; } catch { return false; }
}
function dismissOnb(): void {
  try { sessionStorage.setItem(ONB_SKIP_KEY, "1"); } catch { /* ignore */ }
}
/** A signed-in listener who hasn't yet claimed the welcome gift (and hasn't
 *  skipped this session) should see onboarding. */
function shouldOnboard(listener?: { onboardingGiftClaimed?: boolean } | null): boolean {
  return Boolean(listener) && !listener!.onboardingGiftClaimed && !onbDismissed();
}

export interface PlayerState {
  current: CatalogTrack | null;
  playing: boolean;
  /** Real seconds of contiguous playback this session (the metered quantity). */
  billedSec: number;
  /** Current playhead + duration (seconds). */
  cur: number;
  dur: number;
  /** Live prepaid wallet balance (cents) — decremented as minutes are charged. */
  balanceCents: number;
  /** False until the first balance read resolves — the meter shows a loading
   *  shell, not a misleading $0.00 "out of funds", while the wallet loads. */
  balanceReady: boolean;
  /** Whether auth is configured AND the listener is signed out. */
  needsAuth: boolean;
  /** Play a track (optionally seeding a queue for next/prev + autoplay). */
  play: (track: CatalogTrack, queue?: CatalogTrack[]) => void;
  /** Pause/resume the current track. */
  toggle: () => void;
  /** Seek to a time (seconds) — the jump is never billed. */
  seek: (to: number) => void;
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  /** Open the add-funds sheet (e.g. from the wallet chip). */
  openTopUp: () => void;
  /** Re-read balance/auth after an external change (e.g. wallet top-up page). */
  refresh: () => void;
}

const Ctx = createContext<PlayerState | null>(null);

export function usePlayer(): PlayerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within <PlayerProvider>");
  return ctx;
}

export default function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // True while seeking/scrubbing — gates the meter so dragged (skipped) time is
  // never charged, only contiguous real playback is.
  const seekingRef = useRef(false);

  const [current, setCurrent] = useState<CatalogTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [billedSec, setBilledSec] = useState(0);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const [needsAuth, setNeedsAuth] = useState(false);
  const [balanceCents, setBalanceCents] = useState(0);
  const [balanceReady, setBalanceReady] = useState(false);
  const [gate, setGate] = useState<CatalogTrack | null>(null); // sign-in prompt
  const [topup, setTopup] = useState(false); // add-funds prompt
  const [onboard, setOnboard] = useState(false); // first-run welcome + gift
  const [pending, setPending] = useState<CatalogTrack | null>(null); // play after funded/gifted

  // Minutes already paid for the current play (1 after the prepaid first minute).
  const chargedMinutesRef = useRef(0);
  const nowRef = useRef<CatalogTrack | null>(null);

  // Playback queue for next/prev + autoplay-on-end.
  const queueRef = useRef<CatalogTrack[]>([]);
  const [queuePos, setQueuePos] = useState(-1);

  const loadMe = useCallback(() => {
    fetchMe()
      .then((m) => {
        setNeedsAuth(Boolean(m.authConfigured) && !m.account);
        setBalanceCents(m.profiles?.listener?.balanceCents ?? 0);
        // Already signed in but never claimed the welcome gift → onboard them.
        if (m.account && shouldOnboard(m.profiles?.listener)) setOnboard(true);
      })
      .finally(() => setBalanceReady(true));
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  // Any sign-in anywhere in the app (AuthButton, sign-up form, top-up gate, …)
  // broadcasts this event; a first-time listener gets the welcome flow + gift.
  useEffect(() => {
    const onSignedIn = (e: Event) => {
      const detail = (e as CustomEvent).detail as { profiles?: { listener?: { balanceCents?: number; onboardingGiftClaimed?: boolean } | null } } | undefined;
      const listener = detail?.profiles?.listener ?? null;
      setNeedsAuth(false);
      setBalanceCents(listener?.balanceCents ?? 0);
      if (shouldOnboard(listener)) setOnboard(true);
    };
    window.addEventListener("tollroad:signedin", onSignedIn);
    return () => window.removeEventListener("tollroad:signedin", onSignedIn);
  }, []);

  useEffect(() => { nowRef.current = current; }, [current]);

  // metering loop — accrue real elapsed playback time only; never bill seeks,
  // scrubs, or loops. `seeking`/`seeked` (fired for clicks, drags, keyboard,
  // and any programmatic currentTime change) pause the meter and re-anchor it
  // to the post-seek position so the jump itself is free.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let last = a.currentTime;
    const onMeta = () => setDur(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onSeeking = () => { seekingRef.current = true; };
    const onSeeked = () => { seekingRef.current = false; last = a.currentTime; setCur(a.currentTime); };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("seeking", onSeeking);
    a.addEventListener("seeked", onSeeked);
    const id = window.setInterval(() => {
      if (a.paused || a.seeking || seekingRef.current) { last = a.currentTime; return; }
      const t = a.currentTime;
      const delta = t - last;
      last = t;
      if (delta > 0 && delta < 2) setBilledSec((b) => b + delta);
      setCur(t);
    }, 100);
    return () => {
      window.clearInterval(id);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("seeking", onSeeking);
      a.removeEventListener("seeked", onSeeked);
    };
  }, []);

  /** Charge one metered minute (the x402 payment). Returns the new balance and
   *  whether it covered — 402 from the API surfaces as ok:false. */
  const postCharge = useCallback(
    async (trackId: string): Promise<{ ok: boolean; balanceCents: number }> => {
      try {
        return await api.charge(trackId);
      } catch {
        return { ok: false, balanceCents };
      }
    },
    [balanceCents],
  );

  // Per-minute billing: the first minute is prepaid in beginPlay; thereafter,
  // each time real playback crosses another whole minute we charge the next one.
  // Out of funds mid-track → pause and open the top-up sheet.
  useEffect(() => {
    const t = nowRef.current;
    if (!t || !playing) return;
    const reached = Math.floor(billedSec / 60); // whole minutes beyond the first
    if (reached >= chargedMinutesRef.current) {
      chargedMinutesRef.current = reached + 1; // claim the slot before the await
      postCharge(t.id).then((r) => {
        setBalanceCents(r.balanceCents);
        if (!r.ok) {
          audioRef.current?.pause();
          setPending(t);
          setTopup(true);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billedSec, playing]);

  /** Authorize the stream via the API (x402-gated), then play. Records the play
   *  to recently-played, fire-and-forget. */
  const stream = useCallback(async (t: CatalogTrack) => {
    const a = audioRef.current;
    if (!a) return;
    setCurrent(t);
    setCur(0);
    setDur(0);
    setBilledSec(0);
    api.recordPlay(t.id);
    try {
      a.src = await api.streamUrl(t.id);
      a.play().catch(() => {});
    } catch {
      /* grant failed (e.g. 402 race) — the meter will re-charge on the next tick */
    }
  }, []);

  /** Bill the first minute, THEN stream (so nothing decrypts unpaid). */
  const beginPlay = useCallback(
    async (t: CatalogTrack) => {
      const charge = await postCharge(t.id);
      setBalanceCents(charge.balanceCents);
      if (!charge.ok) {
        setPending(t);
        setTopup(true);
        return;
      }
      chargedMinutesRef.current = 1; // the first minute is paid
      stream(t);
    },
    [postCharge, stream],
  );

  const play = useCallback(
    (t: CatalogTrack, queue?: CatalogTrack[]) => {
      const a = audioRef.current;
      if (!a) return;
      if (queue) {
        queueRef.current = queue;
        setQueuePos(queue.findIndex((x) => x.id === t.id));
      } else if (queueRef.current.findIndex((x) => x.id === t.id) === -1) {
        queueRef.current = [t];
        setQueuePos(0);
      } else {
        setQueuePos(queueRef.current.findIndex((x) => x.id === t.id));
      }
      // Toggle the already-playing track without re-gating.
      if (nowRef.current?.id === t.id) {
        if (a.paused) a.play().catch(() => {});
        else a.pause();
        return;
      }
      if (needsAuth) { setGate(t); return; } // must sign in first
      if (balanceCents <= 0) { setPending(t); setTopup(true); return; } // must have funds
      beginPlay(t);
    },
    [needsAuth, balanceCents, beginPlay],
  );

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !nowRef.current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  // Full-service scrubbing: seek anywhere in the track. Setting currentTime
  // fires the native seek events above, so the skipped span is never billed.
  const seek = useCallback((to: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(to)) return;
    seekingRef.current = true; // suppress the meter immediately, before `seeking` lands
    a.currentTime = Math.max(0, Math.min(to, a.duration || to));
    setCur(a.currentTime);
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current;
    const i = queuePos + 1;
    if (i >= 0 && i < q.length) { setQueuePos(i); play(q[i], q); }
  }, [queuePos, play]);

  const prev = useCallback(() => {
    const q = queueRef.current;
    const i = queuePos - 1;
    if (i >= 0 && i < q.length) { setQueuePos(i); play(q[i], q); }
  }, [queuePos, play]);

  // Autoplay the next queued track when one ends.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => next();
    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [next]);

  const value = useMemo<PlayerState>(
    () => ({
      current,
      playing,
      billedSec,
      cur,
      dur,
      balanceCents,
      balanceReady,
      needsAuth,
      play,
      toggle,
      seek,
      next,
      prev,
      hasNext: queuePos >= 0 && queuePos + 1 < queueRef.current.length,
      hasPrev: queuePos > 0,
      openTopUp: () => setTopup(true),
      refresh: loadMe,
    }),
    [current, playing, billedSec, cur, dur, balanceCents, balanceReady, needsAuth, play, toggle, seek, next, prev, queuePos, loadMe],
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      <audio ref={audioRef} preload="none" />

      {gate && (
        <SignInSheet
          reason="Sign in to start listening — the meter bills your wallet by the minute."
          onClose={() => setGate(null)}
          onSignedIn={(m) => {
            setNeedsAuth(false);
            const t = gate;
            setGate(null);
            const listener = m.profiles?.listener ?? null;
            const bal = listener?.balanceCents ?? 0;
            setBalanceCents(bal);
            // Brand-new listener: welcome them and hand over the $3 gift, then
            // resume the track they tried to play — never dead-end into top-up.
            if (shouldOnboard(listener)) { setPending(t); setOnboard(true); return; }
            if (!t) return;
            if (bal <= 0) { setPending(t); setTopup(true); }
            else beginPlay(t);
          }}
        />
      )}

      {onboard && (
        <OnboardingFlow
          onClose={() => { dismissOnb(); setOnboard(false); setPending(null); }}
          onClaimed={(cents) => {
            setBalanceCents(cents);
            setOnboard(false);
            const t = pending;
            setPending(null);
            if (t && cents > 0) beginPlay(t);
          }}
        />
      )}

      {topup && (
        <TopUpSheet
          reason={balanceCents <= 0 ? "You're out of funds — add money to keep listening." : undefined}
          onClose={() => { setTopup(false); setPending(null); }}
          onFunded={(cents) => {
            setBalanceCents(cents);
            setTopup(false);
            const t = pending;
            setPending(null);
            if (t) beginPlay(t);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
