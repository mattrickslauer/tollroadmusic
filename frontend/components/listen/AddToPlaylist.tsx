"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useLibrary } from "@/context/LibraryProvider";

/** A "⋯" affordance that opens a small menu to add this track to a playlist
 *  (or create a new one). Reads the playlist list from shared library state. */
export default function AddToPlaylist({ trackId }: { trackId: string }) {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  // Where the menu opens relative to its trigger, picked so it always stays
  // on screen (left-column cards would otherwise slide off the left edge,
  // top rows off the top). Recomputed each time the menu is opened.
  const [place, setPlace] = useState<{ h: "left" | "right"; v: "up" | "down" }>({ h: "left", v: "down" });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggle(e: ReactMouseEvent) {
    e.stopPropagation();
    setOpen((v) => {
      if (!v) {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) {
          const MENU_W = 220, MENU_H = 320, BAR = 96; // approx menu size + reserved player-bar gutter
          setPlace({
            h: r.left + MENU_W <= window.innerWidth ? "left" : "right",
            v: r.bottom + MENU_H <= window.innerHeight - BAR ? "down" : "up",
          });
        }
      }
      return !v;
    });
  }

  async function add(id: string) {
    await addToPlaylist(id, trackId);
    setDone(id);
    setTimeout(() => { setOpen(false); setDone(null); }, 700);
  }

  async function create() {
    const n = name.trim();
    if (!n) return;
    const pl = await createPlaylist(n);
    setName("");
    setCreating(false);
    if (pl) add(pl.id);
  }

  return (
    <div className="lx-menu-wrap" ref={ref}>
      <button
        ref={btnRef}
        className="lx-menu-btn"
        onClick={toggle}
        aria-label="Add to playlist"
        title="Add to playlist"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="lx-menu" role="menu" data-h={place.h} data-v={place.v} onClick={(e) => e.stopPropagation()}>
          <div className="lx-menu-head">Add to playlist</div>
          <div className="lx-menu-list">
            {playlists.map((p) => (
              <button key={p.id} className="lx-menu-item" data-done={done === p.id} onClick={() => add(p.id)}>
                {done === p.id ? "Added ✓" : p.name}
              </button>
            ))}
            {playlists.length === 0 && !creating && <div className="lx-menu-empty">No playlists yet</div>}
          </div>
          {creating ? (
            <div className="lx-menu-create">
              <input
                className="lx-menu-input"
                autoFocus
                placeholder="Playlist name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <button className="lx-menu-add" onClick={create} disabled={!name.trim()}>Create</button>
            </div>
          ) : (
            <button className="lx-menu-item lx-menu-new" onClick={() => setCreating(true)}>+ New playlist</button>
          )}
        </div>
      )}
    </div>
  );
}
