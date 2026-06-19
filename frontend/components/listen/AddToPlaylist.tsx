"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useLibrary } from "@/context/LibraryProvider";

const MENU_W = 220;
const MENU_H = 320; // upper bound used only to decide up/down placement
const GUTTER = 8; // keep this far from any viewport edge
const PLAYER_BAR = 96; // reserve room for the fixed player bar at the bottom

/** A "⋯" affordance that opens a small menu to add this track to a playlist
 *  (or create a new one). The menu is rendered in a portal with fixed
 *  positioning so it can never be clipped by, or painted under, the card /
 *  row it lives in — it's anchored to the trigger and clamped on screen. */
export default function AddToPlaylist({ trackId }: { trackId: string }) {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Horizontal: prefer aligning the menu's left edge to the trigger, flip to
    // right-aligned near the right edge, then clamp inside the viewport.
    let left = r.left + MENU_W <= vw - GUTTER ? r.left : r.right - MENU_W;
    left = Math.min(Math.max(left, GUTTER), vw - MENU_W - GUTTER);
    // Vertical: open downward if it fits above the player bar, else upward.
    const down = r.bottom + MENU_H <= vh - PLAYER_BAR;
    const style: CSSProperties = { position: "fixed", left };
    if (down) style.top = r.bottom + 6;
    else style.bottom = vh - r.top + 6;
    setPos(style);
  }

  function toggle(e: ReactMouseEvent) {
    e.stopPropagation();
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Fixed positioning is relative to the viewport, so reposition-or-close
    // when the page scrolls or resizes underneath the open menu.
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

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
    <div className="lx-menu-wrap">
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
      {open && pos && typeof document !== "undefined" && createPortal(
        // Scope wrapper: the menu portals to <body>, outside .app-dark, so the
        // --app-* design tokens (its background, borders, text) wouldn't
        // resolve. display:contents adds the token scope without a box.
        <div className="app-dark" style={{ display: "contents" }}>
        <div ref={menuRef} className="lx-menu" role="menu" style={pos} onClick={(e) => e.stopPropagation()}>
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
        </div>,
        document.body,
      )}
    </div>
  );
}
