'use client'

import Image from "next/image";
import { useMemo } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { BACKGROUND } from "@/lib/colors";

export default function PlaybackBar() {
  const player = usePlayer();
  if (!player) return null;
  const p = player;
  const { currentTrack, isPlaying, currentTime, duration, volume } = p;

  function formatTime(s: number) {
    const t = Math.floor(s || 0);
    const m = Math.floor(t / 60);
    const r = t % 60;
    const rr = r < 10 ? `0${r}` : `${r}`;
    return `${m}:${rr}`;
  }

  function onToggle() {
    p.togglePlay();
  }

  function onNext() {
    p.next();
  }

  function onPrev() {
    p.prev();
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value);
    p.seekTo(v);
  }

  function onVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value);
    p.setVolume(v);
  }

  const progressMax = useMemo(function computeMax() {
    return isFinite(duration) && duration > 0 ? duration : 0;
  }, [duration]);

  return (
    <div
      className="playback-bar"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: BACKGROUND,
        color: "#000",
        borderTop: "1px dashed #000",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 50,
      }}
      role="region"
      aria-label="Global playback"
    >
      <div className="pb-info" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            overflow: "hidden",
            background: "#eee",
            flex: "0 0 auto",
          }}
        >
          {currentTrack ? (
            <Image
              src={currentTrack.coverPath}
              alt={currentTrack.title}
              width={40}
              height={40}
              style={{ objectFit: "cover" }}
            />
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
              maxWidth: "32vw",
            }}
          >
            {currentTrack ? currentTrack.title : "Nothing playing"}
          </div>
          <div style={{ opacity: 0.6 }}>{currentTrack ? currentTrack.artistName : ""}</div>
        </div>
      </div>
      <div className="pb-controls" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={onPrev}
          style={{ padding: "6px 10px", border: "1px dashed #000", borderRadius: 8, background: "transparent", cursor: "pointer" }}
          aria-label="Previous"
        >
          <Image src="/icons/next.svg" alt="Previous" width={20} height={20} style={{ transform: "scaleX(-1)" }} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          style={{ padding: "6px 10px", border: "1px dashed #000", borderRadius: 8, background: "transparent", cursor: "pointer" }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Image src="/icons/pause.svg" alt="Pause" width={22} height={22} />
          ) : (
            <Image src="/icons/play.svg" alt="Play" width={22} height={22} />
          )}
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{ padding: "6px 10px", border: "1px dashed #000", borderRadius: 8, background: "transparent", cursor: "pointer" }}
          aria-label="Next"
        >
          <Image src="/icons/next.svg" alt="Next" width={20} height={20} />
        </button>
      </div>
      <div className="pb-progress" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <div style={{ width: 44, textAlign: "right", opacity: 0.7 }}>{formatTime(currentTime)}</div>
        <input
          type="range"
          min={0}
          max={progressMax}
          step={1}
          value={Math.min(currentTime, progressMax)}
          onChange={onSeek}
          style={{ flex: 1 }}
          aria-label="Seek"
        />
        <div style={{ width: 44, opacity: 0.7 }}>{formatTime(duration)}</div>
      </div>
      <div className="pb-vol" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ opacity: 0.7 }}>Vol</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={onVolume}
          aria-label="Volume"
        />
      </div>
      <style jsx>{`
        @media (max-width: 640px) {
          .playback-bar {
            flex-wrap: wrap;
            gap: 8px;
          }
          .pb-info {
            min-width: 0;
            flex: 1 1 60%;
          }
          .pb-controls {
            flex: 0 0 auto;
          }
          .pb-progress {
            flex: 1 1 100%;
          }
          .pb-progress input[type='range'] {
            width: 100%;
          }
          .pb-vol {
            flex: 0 0 auto;
          }
        }
      `}</style>
    </div>
  );
}


