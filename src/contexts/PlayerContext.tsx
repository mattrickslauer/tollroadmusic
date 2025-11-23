'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useX402 } from "@coinbase/cdp-hooks";
import { Track } from "@/types/music";

type PlayerContextValue = {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  currentIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  spentCents: number;
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setQueue: (tracks: Track[], startIndex: number) => void;
  seekTo: (seconds: number) => void;
  setVolume: (v: number) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  return useContext(PlayerContext);
}

export default function PlayerProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueueState] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.9);
  const [currentObjectUrl, setCurrentObjectUrl] = useState<string | null>(null);
  const { fetchWithPayment } = useX402();

  useEffect(function ensureAudio() {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "metadata";
      audioRef.current.volume = volume;
    }
  }, []);

  useEffect(function syncVolume() {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(function attachEvents() {
    if (!audioRef.current) return;
    const a = audioRef.current;
    function onTimeUpdate() {
      setCurrentTime(a.currentTime || 0);
      setDuration(a.duration || 0);
    }
    function onEnded() {
      handleNext();
    }
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("ended", onEnded);
    return function cleanup() {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("ended", onEnded);
    };
  }, [currentIndex, queue]);

  function loadAndPlay(track: Track) {
    console.log("[Player] loadAndPlay", { trackId: track.id, src: track.audioPath });
    if (!audioRef.current) return;
    const a = audioRef.current;
    const src = track.audioPath;
    if (!src) {
      console.log("[Player] no src for track", { trackId: track.id });
      return;
    }
    if (currentObjectUrl) {
      console.log("[Player] revoke previous object url");
      URL.revokeObjectURL(currentObjectUrl);
    }
    console.log("[Player] fetchWithPayment start", { src });
    try {
      fetchWithPayment(src, {
        method: "GET",
      })
        .then(function onRes(res: any) {
          console.log("[Player] fetchWithPayment response", { ok: (res as any)?.ok, status: (res as any)?.status });
          if (!(res as any)?.ok) {
            throw new Error("stream failed " + String((res as any)?.status || ""));
          }
          const headers = (res as any)?.headers;
          const ct = headers && typeof headers.get === "function" ? headers.get("Content-Type") : null;
          if (!ct || typeof ct !== "string" || ct.indexOf("audio/") !== 0) {
            throw new Error("invalid content-type " + String(ct || ""));
          }
          return (res as any).blob();
        })
        .then(function onBlob(blob: any) {
          console.log("[Player] blob created", { size: blob.size });
          const url = URL.createObjectURL(blob);
          setCurrentObjectUrl(url);
          a.src = url;
          a.currentTime = 0;
          return a.play();
        })
        .then(function onOK() {
          console.log("[Player] play started");
          setIsPlaying(true);
        })
        .catch(function onErrAsync(e: any) {
          console.error("[Player] loadAndPlay error (x402-async)", e);
          setIsPlaying(false);
        });
    } catch (e: any) {
      console.error("[Player] loadAndPlay error (x402-sync)", e);
      setIsPlaying(false);
    }
  }

  function playTrack(track: Track, newQueue?: Track[]) {
    if (newQueue && newQueue.length > 0) {
      setQueueState(newQueue);
      const idx = newQueue.findIndex(function find(t) { return t.id === track.id; });
      setCurrentIndex(idx >= 0 ? idx : 0);
      loadAndPlay(idx >= 0 ? newQueue[idx] : newQueue[0]);
      return;
    }
    const idxExisting = queue.findIndex(function find(t) { return t.id === track.id; });
    if (idxExisting >= 0) {
      setCurrentIndex(idxExisting);
      loadAndPlay(queue[idxExisting]);
    } else {
      setQueueState([track]);
      setCurrentIndex(0);
      loadAndPlay(track);
    }
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(function onOK() {
        setIsPlaying(true);
      }).catch(function onErr() {
        setIsPlaying(false);
      });
    }
  }

  function handleNext() {
    if (queue.length === 0) return;
    const nextIndex = currentIndex + 1 >= queue.length ? 0 : currentIndex + 1;
    setCurrentIndex(nextIndex);
    loadAndPlay(queue[nextIndex]);
  }

  function handlePrev() {
    if (queue.length === 0) return;
    const prevIndex = currentIndex - 1 < 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    loadAndPlay(queue[prevIndex]);
  }

  function setQueue(tracks: Track[], startIndex: number) {
    if (tracks.length === 0) return;
    setQueueState(tracks);
    setCurrentIndex(startIndex);
    loadAndPlay(tracks[startIndex]);
  }

  function seekTo(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function setVolume(v: number) {
    const nv = Math.max(0, Math.min(1, v));
    setVolumeState(nv);
  }

  const currentTrack = useMemo(function computeCurrentTrack() {
    if (currentIndex < 0 || currentIndex >= queue.length) return null;
    return queue[currentIndex] || null;
  }, [queue, currentIndex]);

  const spentCents = useMemo(function computeSpentCents() {
    if (!currentTrack) return 0;
    const price = currentTrack.pricePerMinuteCents;
    if (!Number.isFinite(price) || price <= 0) return 0;
    const t = currentTime || 0;
    if (!Number.isFinite(t) || t <= 0) return 0;
    const minutes = Math.floor(t / 60);
    if (minutes <= 0) return 0;
    const total = minutes * price;
    if (!Number.isFinite(total) || total < 0) return 0;
    return total;
  }, [currentTrack, currentTime]);

  const value: PlayerContextValue = {
    currentTrack,
    isPlaying,
    queue,
    currentIndex,
    currentTime,
    duration,
    volume,
    spentCents,
    playTrack,
    togglePlay,
    next: handleNext,
    prev: handlePrev,
    setQueue,
    seekTo,
    setVolume,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}


