"use client";

import { useState } from "react";
import { absoluteUrl } from "@/lib/shareUrls";

/** Share affordance used on track rows/cards, the player bar, and artist
 *  profiles. On devices with the Web Share API it opens the native share sheet
 *  (ideal for texting a link); everywhere else it copies the absolute URL to the
 *  clipboard and flashes "Copied!". `path` is a relative share path (e.g. from
 *  songPath/artistPath) — we absolutize it here so the shared link works
 *  off-site. Stops propagation so it never triggers an enclosing play handler. */
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
  const [copied, setCopied] = useState(false);

  async function onShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = absoluteUrl(path);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return; // user cancelled the native sheet — do nothing
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — silently no-op */
    }
  }

  return (
    <button
      className={["lx-like", "lx-share-icon", className].filter(Boolean).join(" ")}
      data-copied={copied}
      onClick={onShare}
      aria-label={`Share ${title}`}
      title="Share"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
    </button>
  );
}
