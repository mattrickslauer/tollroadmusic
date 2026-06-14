"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, CatalogTrack } from "@/lib/catalog";
import { fetchMe } from "@/lib/auth";
import SignInSheet from "@/components/SignInSheet";

function clock(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * The browse experience. A grid of real, playable tracks; selecting one streams
 * it and a docked meter bills against live playback at the track's per-minute
 * rate — the same instrument as the landing page, now over the whole catalog.
 */
export default function Catalog({ data }: { data: Catalog }) {
  const { tracks, stats } = data;
  const audioRef = useRef<HTMLAudioElement>(null);

  const [genre, setGenre] = useState<string>("All");
  const [q, setQ] = useState("");
  const [nowId, setNowId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [billedSec, setBilledSec] = useState(0);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  // Metering requires a signed-in listener (only when auth is configured).
  // `gate` holds the track the user tried to play while signed out.
  const [needsAuth, setNeedsAuth] = useState(false); // auth configured AND not signed in
  const [gate, setGate] = useState<CatalogTrack | null>(null);

  useEffect(() => {
    fetchMe().then((m) => setNeedsAuth(Boolean(m.authConfigured) && !m.account));
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

  // metering loop — accrue real elapsed playback time, ignore seeks/loops
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setDur(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    let last = a.currentTime;
    const id = window.setInterval(() => {
      if (a.paused) { last = a.currentTime; return; }
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
    };
  }, []);

  const start = (t: CatalogTrack) => {
    const a = audioRef.current;
    if (!a) return;
    setNowId(t.id);
    setCur(0);
    setDur(0);
    a.src = encodeURI(t.audioKey);
    a.play().catch(() => {});
  };

  const play = (t: CatalogTrack) => {
    const a = audioRef.current;
    if (!a) return;
    // Toggle the already-playing track without re-gating.
    if (nowId === t.id) {
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    // The meter only bills signed-in listeners — gate the first play.
    if (needsAuth) {
      setGate(t);
      return;
    }
    start(t);
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
              <div className="cat-bar-bar"><span style={{ width: `${progress}%` }} /></div>
              <div className="cat-bar-time">{clock(cur)} / {clock(dur)}</div>
            </div>
            <div className="cat-bar-cost">
              <div className="cat-bar-readout">${cost.toFixed(4)}<span>billed</span></div>
              <div className="cat-bar-readout">{now.pricePerMinuteCents}¢<span>per minute</span></div>
            </div>
          </div>
        </div>
      )}

      {gate && (
        <SignInSheet
          reason="Sign in to start listening — the meter only bills signed-in listeners."
          onClose={() => setGate(null)}
          onSignedIn={() => {
            setNeedsAuth(false);
            const t = gate;
            setGate(null);
            start(t);
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
