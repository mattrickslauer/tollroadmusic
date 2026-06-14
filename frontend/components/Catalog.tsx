"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Catalog, CatalogTrack } from "@/lib/catalog";
import { fetchMe } from "@/lib/auth";
import SignInSheet from "@/components/SignInSheet";
import TopUpSheet from "@/components/TopUpSheet";

function clock(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * The browse experience. A grid of real, playable tracks; selecting one streams
 * it through /api/stream — which only decrypts the audio AFTER the minute is
 * billed — and a docked meter draws from the listener's prepaid wallet at the
 * track's per-minute rate. No funds → the top-up sheet, not the audio.
 */
export default function Catalog({ data }: { data: Catalog }) {
  const { tracks, stats } = data;
  const audioRef = useRef<HTMLAudioElement>(null);
  // True while the listener is seeking/scrubbing — gates the meter so dragged
  // (skipped) time is never charged, only contiguous real playback is.
  const seekingRef = useRef(false);

  const [genre, setGenre] = useState<string>("All");
  const [q, setQ] = useState("");
  const [nowId, setNowId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [billedSec, setBilledSec] = useState(0);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  // Auth + wallet gating. `needsAuth`: auth configured AND not signed in.
  // `balanceCents`: the listener's prepaid balance the meter draws from.
  const [needsAuth, setNeedsAuth] = useState(false);
  const [balanceCents, setBalanceCents] = useState(0);
  const [gate, setGate] = useState<CatalogTrack | null>(null);   // sign-in prompt
  const [topup, setTopup] = useState(false);                      // add-funds prompt
  const [pending, setPending] = useState<CatalogTrack | null>(null); // play after funded

  // Minutes already paid for the current play (1 after the prepaid first minute).
  const chargedMinutesRef = useRef(0);
  const nowRef = useRef<CatalogTrack | null>(null);

  useEffect(() => {
    fetchMe().then((m) => {
      setNeedsAuth(Boolean(m.authConfigured) && !m.account);
      setBalanceCents(m.profiles?.listener?.balanceCents ?? 0);
    });
  }, []);

  const genres = useMemo(
    () => ["All", ...Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean) as string[])).sort()],
    [tracks],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tracks.filter(
      (t) =>
        (genre === "All" || t.genre === genre) &&
        (!needle || t.title.toLowerCase().includes(needle) || t.artistName.toLowerCase().includes(needle)),
    );
  }, [tracks, genre, q]);

  const now = useMemo(() => tracks.find((t) => t.id === nowId) || null, [tracks, nowId]);
  useEffect(() => { nowRef.current = now; }, [now]);

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

  /** Charge one metered minute. Returns the new balance and whether it covered. */
  async function postCharge(trackId: string): Promise<{ ok: boolean; balanceCents: number }> {
    try {
      const res = await fetch("/api/play/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const d = await res.json().catch(() => null);
      if (res.status === 402) return { ok: false, balanceCents: d?.balanceCents ?? 0 };
      if (!res.ok) return { ok: false, balanceCents };
      return { ok: true, balanceCents: d.balanceCents };
    } catch {
      return { ok: false, balanceCents };
    }
  }

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

  // Full-service scrubbing: seek anywhere in the track. Setting currentTime
  // fires the native seek events above, so the skipped span is never billed.
  const scrub = (to: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(to)) return;
    seekingRef.current = true; // suppress the meter immediately, before `seeking` lands
    a.currentTime = Math.max(0, Math.min(to, a.duration || to));
    setCur(a.currentTime);
  };

  /** Point the player at the decrypting stream and play. */
  const stream = (t: CatalogTrack) => {
    const a = audioRef.current;
    if (!a) return;
    setNowId(t.id);
    setCur(0);
    setDur(0);
    setBilledSec(0);
    a.src = `/api/stream/${t.id}`;
    a.play().catch(() => {});
  };

  /** Bill the first minute, THEN stream (so nothing decrypts unpaid). */
  async function beginPlay(t: CatalogTrack) {
    const charge = await postCharge(t.id);
    setBalanceCents(charge.balanceCents);
    if (!charge.ok) {
      setPending(t);
      setTopup(true);
      return;
    }
    chargedMinutesRef.current = 1; // the first minute is paid
    stream(t);
  }

  const play = (t: CatalogTrack) => {
    const a = audioRef.current;
    if (!a) return;
    // Toggle the already-playing track without re-gating.
    if (nowId === t.id) {
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    if (needsAuth) { setGate(t); return; }   // must sign in first
    if (balanceCents <= 0) { setPending(t); setTopup(true); return; } // must have funds
    beginPlay(t);
  };

  const minutes = billedSec / 60;
  const cost = now ? (minutes * now.pricePerMinuteCents) / 100 : 0;
  const progress = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <>
      <div className="cat-stats">
        <Stat k="Artists" v={String(stats.artists)} />
        <Stat k="Tracks" v={String(stats.tracks)} />
        <Stat k="Minutes played" v={stats.minutes.toLocaleString("en-US")} />
        <Stat k="Genres" v={String(Math.max(0, genres.length - 1))} />
      </div>

      {!needsAuth && (
        <div className="cat-wallet">
          <span className="cat-wallet-bal" data-low={balanceCents <= 0}>
            Wallet: <strong>{usd(balanceCents)}</strong>
          </span>
          <button className="cat-wallet-add" onClick={() => setTopup(true)}>Add funds</button>
          <Link className="cat-wallet-link" href="/wallet">History →</Link>
        </div>
      )}

      <div className="cat-controls">
        <input
          className="cat-search"
          placeholder="Search tracks or artists…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cat-genres">
          {genres.map((g) => (
            <button
              key={g}
              className="cat-chip"
              data-on={genre === g}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="cat-grid">
        {visible.map((t) => {
          const active = t.id === nowId;
          return (
            <article key={t.id} className="cat-card" data-on={active}>
              <button className="cat-cover" onClick={() => play(t)} aria-label={`Play ${t.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.coverImageKey || "/covers/placeholder.svg"} alt="" loading="lazy" />
                <span className="cat-play">
                  {active && playing ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
                  )}
                </span>
                {active && <span className="cat-eq" aria-hidden="true"><i /><i /><i /></span>}
              </button>
              <div className="cat-meta">
                <div className="cat-title" title={t.title}>{t.title}</div>
                <div className="cat-artist">{t.artistName}</div>
                <div className="cat-tags">
                  {t.genre && <span className="cat-tag">{t.genre}</span>}
                  <span className="cat-rate">{t.pricePerMinuteCents}¢/min</span>
                  <span className="cat-dur">{clock(t.durationSeconds)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && <p className="cat-empty">No tracks match that.</p>}

      <audio ref={audioRef} preload="none" />

      {now && (
        <div className="cat-bar">
          <div className="wrap cat-bar-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cat-bar-cover" src={now.coverImageKey || "/covers/placeholder.svg"} alt="" />
            <button className="cat-bar-btn" onClick={() => play(now)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
              )}
            </button>
            <div className="cat-bar-track">
              <div className="cat-bar-now">
                <span className="live" data-on={playing}><span className="dot" />{playing ? "LIVE · METERING" : "PAUSED"}</span>
                <strong>{now.title}</strong> · {now.artistName}
              </div>
              <div className="cat-bar-bar">
                <span style={{ width: `${progress}%` }} />
                <i className="cat-bar-knob" style={{ left: `${progress}%` }} aria-hidden="true" />
                <input
                  className="cat-bar-scrub"
                  type="range"
                  min={0}
                  max={dur || 0}
                  step="any"
                  value={Math.min(cur, dur || 0)}
                  disabled={!dur}
                  aria-label={`Seek — ${clock(cur)} of ${clock(dur)}`}
                  onChange={(e) => scrub(Number(e.target.value))}
                />
              </div>
              <div className="cat-bar-time">{clock(cur)} / {clock(dur)}</div>
            </div>
            <div className="cat-bar-cost">
              <div className="cat-bar-readout">{usd(balanceCents)}<span>balance</span></div>
              <div className="cat-bar-readout">${cost.toFixed(4)}<span>this session</span></div>
            </div>
          </div>
        </div>
      )}

      {gate && (
        <SignInSheet
          reason="Sign in to start listening — the meter bills your wallet by the minute."
          onClose={() => setGate(null)}
          onSignedIn={(m) => {
            setNeedsAuth(false);
            const t = gate;
            setGate(null);
            const bal = m.profiles?.listener?.balanceCents ?? 0;
            setBalanceCents(bal);
            if (!t) return;
            if (bal <= 0) { setPending(t); setTopup(true); }
            else beginPlay(t);
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
    </>
  );
}

function Stat({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div className="cat-stat">
      <div className={`cat-stat-v${green ? " green" : ""}`}>{v}</div>
      <div className="cat-stat-k">{k}</div>
    </div>
  );
}
