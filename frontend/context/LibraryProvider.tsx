"use client";

// Library state shared across the (listen) app: which tracks are liked (so the
// heart is consistent everywhere it appears) and the listener's playlists (for
// the sidebar + the "add to playlist" menu). Mounted alongside PlayerProvider in
// the (listen) layout. All reads/writes go through the typed API client.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PlaylistSummary } from "@/lib/api/types";
import * as api from "@/lib/api/client";

interface LibraryState {
  likedIds: Set<string>;
  isLiked: (trackId: string) => boolean;
  /** Optimistically toggle a like; reconciles with the server response. */
  toggleLike: (trackId: string) => Promise<void>;
  playlists: PlaylistSummary[];
  /** False until the initial likes + playlists load settles, so consumers can
   *  show a loading shell instead of an empty grid. */
  ready: boolean;
  refreshPlaylists: () => void;
  createPlaylist: (name: string) => Promise<PlaylistSummary | null>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

const Ctx = createContext<LibraryState | null>(null);

export function useLibrary(): LibraryState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLibrary must be used within <LibraryProvider>");
  return ctx;
}

export default function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [ready, setReady] = useState(false);

  const loadLibrary = useCallback(() => {
    const likes = api.getLikes().then((r) => setLikedIds(new Set(r.likedIds))).catch(() => {});
    const pls = api.getPlaylists().then((r) => setPlaylists(r.playlists)).catch(() => {});
    Promise.allSettled([likes, pls]).then(() => setReady(true));
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // Keep the library in sync with auth changes. Sign-in re-fetches the new
  // listener's likes + playlists (otherwise the context keeps whatever loaded at
  // mount — empty for a fresh visitor, or stale from a prior session). Sign-out
  // clears the previous user's data immediately.
  useEffect(() => {
    const onSignedIn = () => loadLibrary();
    const onSignedOut = () => { setLikedIds(new Set()); setPlaylists([]); };
    window.addEventListener("tollroad:signedin", onSignedIn);
    window.addEventListener("tollroad:signedout", onSignedOut);
    return () => {
      window.removeEventListener("tollroad:signedin", onSignedIn);
      window.removeEventListener("tollroad:signedout", onSignedOut);
    };
  }, [loadLibrary]);

  const isLiked = useCallback((id: string) => likedIds.has(id), [likedIds]);

  const toggleLike = useCallback(async (trackId: string) => {
    // optimistic flip
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    try {
      const { liked } = await api.toggleLike(trackId);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    } catch {
      // revert on failure
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
    }
  }, []);

  const refreshPlaylists = useCallback(() => {
    api.getPlaylists().then((r) => setPlaylists(r.playlists)).catch(() => {});
  }, []);

  const createPlaylist = useCallback(async (name: string) => {
    try {
      const pl = await api.createPlaylist(name);
      setPlaylists((prev) => [pl, ...prev]);
      return pl;
    } catch {
      return null;
    }
  }, []);

  const addToPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    try {
      await api.addToPlaylist(playlistId, trackId);
      refreshPlaylists();
    } catch {
      /* ignore */
    }
  }, [refreshPlaylists]);

  const value = useMemo<LibraryState>(
    () => ({ likedIds, isLiked, toggleLike, playlists, ready, refreshPlaylists, createPlaylist, addToPlaylist }),
    [likedIds, isLiked, toggleLike, playlists, ready, refreshPlaylists, createPlaylist, addToPlaylist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
