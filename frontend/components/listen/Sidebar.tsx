"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { useLibrary } from "@/context/LibraryProvider";
import { Sk } from "./Skeleton";

const NAV = [
  { href: "/browse", label: "Browse", icon: "home" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/liked", label: "Liked Songs", icon: "heart" },
  { href: "/library", label: "Your Library", icon: "library" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
] as const;

function Icon({ name }: { name: string }) {
  const p = {
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    heart: <path d="M12 21s-7-4.3-9.3-8.5C1.4 9.9 2.4 6.7 5.4 6c1.9-.4 3.6.6 4.6 2 1-1.4 2.7-2.4 4.6-2 3 .7 4 3.9 2.7 6.5C19 16.7 12 21 12 21z" />,
    library: <><path d="M4 5h2v14H4zM9 5h2v14H9z" /><path d="M14 5h2v14h-2z" /></>,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h3" /></>,
  }[name];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {p}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { playlists, ready, createPlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n) return;
    await createPlaylist(n);
    setName("");
    setCreating(false);
  }

  const close = () => setOpen(false);

  return (
    <>
      <button
        className="lx-burger"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className="lx-scrim" data-open={open} onClick={close} aria-hidden="true" />

      <aside className="lx-sidebar" data-open={open}>
        <button className="lx-sidebar-close" onClick={close} aria-label="Close menu">×</button>

        <Link href="/" className="lx-brand" onClick={close}>
          <BrandMark size={26} />
          <span>TollRoad</span>
        </Link>

        <nav className="lx-nav">
          {NAV.map((n) => {
            const active = pathname === n.href || (n.href !== "/browse" && pathname.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} className="lx-nav-item" data-on={active} onClick={close}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="lx-pl">
          <div className="lx-pl-head">
            <span>Playlists</span>
            <button className="lx-pl-new" onClick={() => setCreating((v) => !v)} aria-label="New playlist" title="New playlist">+</button>
          </div>
          {creating && (
            <div className="lx-pl-create">
              <input
                autoFocus
                placeholder="Playlist name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
              />
              <button onClick={create} disabled={!name.trim()}>Add</button>
            </div>
          )}
          <div className="lx-pl-list">
            {!ready ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="lx-pl-item lx-sk-pl">
                  <Sk h={12} w={`${70 - i * 8}%`} radius={4} />
                </div>
              ))
            ) : (
              <>
                {playlists.map((p) => {
                  const href = `/playlist/${p.id}`;
                  return (
                    <Link key={p.id} href={href} className="lx-pl-item" data-on={pathname === href} onClick={close}>
                      {p.name}
                      <span className="lx-pl-count">{p.trackCount}</span>
                    </Link>
                  );
                })}
                {playlists.length === 0 && !creating && <p className="lx-pl-empty">Create your first playlist.</p>}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
