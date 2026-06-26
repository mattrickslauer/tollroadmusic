"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { absoluteUrl, shareTargets } from "@/lib/shareUrls";

const MENU_W = 224;
const MENU_H = 360; // upper bound, only used to decide up/down placement
const GUTTER = 8;
const PLAYER_BAR = 96; // leave room for the fixed player bar at the bottom

/** Share affordance for track rows/cards, the player bar, and artist profiles.
 *  Opens a small popover menu (portaled + fixed-positioned so it can't be
 *  clipped by the row/card it lives in — same pattern as AddToPlaylist) with:
 *   - native "Share…" (the OS sheet) when the Web Share API is available — on
 *     mobile this surfaces every installed app the user can share to;
 *   - "Copy link" with an execCommand fallback so it works even in insecure
 *     contexts where navigator.clipboard is undefined;
 *   - direct deep links (Messages, WhatsApp, Telegram, X, Facebook, Email)
 *     that need no browser APIs at all.
 *  The menu ALWAYS opens on click, so there is immediate visual confirmation —
 *  unlike the previous one-shot button that failed silently when the clipboard
 *  / share APIs were missing. */
export default function ShareButton({
  path,
  title,
  size = 16,
  className,
}: {
  path: string;
  title: string;
  size?: number;
  className?: string;
}) {
  const url = absoluteUrl(path);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left + MENU_W <= vw - GUTTER ? r.left : r.right - MENU_W;
    left = Math.min(Math.max(left, GUTTER), vw - MENU_W - GUTTER);
    const down = r.bottom + MENU_H <= vh - PLAYER_BAR;
    const style: CSSProperties = { position: "fixed", left };
    if (down) style.top = r.bottom + 6;
    else style.bottom = vh - r.top + 6;
    setPos(style);
  }

  function toggle(e: ReactMouseEvent) {
    e.preventDefault();
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

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* user cancelled */
    }
    setOpen(false);
  }

  async function copyLink() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // Fallback for insecure contexts / older browsers where the Clipboard API
      // is unavailable: a hidden textarea + execCommand("copy").
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    // Keep the confirmation visible briefly, then close the menu.
    setTimeout(() => { setCopied(false); setOpen(false); }, ok ? 1100 : 0);
  }

  return (
    <div className="lx-menu-wrap">
      <button
        ref={btnRef}
        className={["lx-like", "lx-share-icon", className].filter(Boolean).join(" ")}
        onClick={toggle}
        aria-label={`Share ${title}`}
        title="Share"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        // display:contents re-scopes the --app-* tokens onto the portaled menu,
        // which renders at <body> outside the .app-dark subtree.
        <div className="app-dark" style={{ display: "contents" }}>
          <div ref={menuRef} className="lx-menu lx-share-menu" role="menu" style={pos} onClick={(e) => e.stopPropagation()}>
            <div className="lx-menu-head">Share</div>
            <div className="lx-menu-list">
              {canNativeShare && (
                <button className="lx-menu-item lx-share-mi" role="menuitem" onClick={nativeShare}>
                  <ShareIcon name="native" />
                  Share…
                </button>
              )}
              <button className="lx-menu-item lx-share-mi" role="menuitem" data-done={copied} onClick={copyLink}>
                <ShareIcon name={copied ? "check" : "copy"} />
                {copied ? "Copied!" : "Copy link"}
              </button>
              {shareTargets(url, title).map((t) => (
                <a
                  key={t.key}
                  className="lx-menu-item lx-share-mi"
                  role="menuitem"
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <ShareIcon name={t.key} />
                  {t.label}
                </a>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Small monochrome leading icon per share channel. Brand glyphs are simplified
 *  to single-color marks so they inherit the menu's text color. */
function ShareIcon({ name }: { name: string }) {
  const svg = (children: ReactNode) => (
    <svg className="lx-share-mi-ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
  const p = (d: string) => svg(d.split("|").map((seg, i) => <path key={i} d={seg} />));
  switch (name) {
    case "native":
      return svg(
        <>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </>,
      );
    case "copy":
      return p("M9 9h10v12H9z|M5 15V3h12");
    case "check":
      return p("M5 13l4 4L19 7");
    case "sms":
      return p("M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z");
    case "whatsapp":
      return p("M6 3h3l1.5 4-2 1.3a11 11 0 0 0 5 5l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2z");
    case "telegram":
      return p("M22 4L2 11l6 2.2L18 7l-7.5 8 .3 4 3-3.5 4.2 3z");
    case "x":
      return p("M4 4l16 16|M20 4L4 20");
    case "facebook":
      return p("M15 4h-2a3 3 0 0 0-3 3v3H7v3h3v8h3v-8h2.5l.5-3H13V7a1 1 0 0 1 1-1h1z");
    case "email":
      return p("M3 6h18v12H3z|M3 7l9 6 9-6");
    default:
      return p("M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1");
  }
}
