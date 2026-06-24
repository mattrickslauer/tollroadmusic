"use client";

import Link from "next/link";
import { ROUTES } from "@/lib/routes";

/**
 * The single way to render an artist's name anywhere in the app: a link to that
 * artist's public profile (/artists/<id>). Use this instead of printing
 * `artistName` directly so every mention is consistently clickable.
 *
 * - `className` is preserved verbatim so existing layout/styling is unchanged;
 *   a shared `lx-artist-link` class is added for the clickable affordance.
 * - `stopPropagation` (default true) keeps a click from triggering an enclosing
 *   play button / clickable row — navigation wins.
 * - Falls back to a plain <span> when there is no id (e.g. "Unknown artist"),
 *   so it never renders a broken link.
 */
export default function ArtistLink({
  id,
  name,
  className,
  stopPropagation = true,
}: {
  id: string | null | undefined;
  name: string;
  className?: string;
  stopPropagation?: boolean;
}) {
  const cls = ["lx-artist-link", className].filter(Boolean).join(" ");
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      className={cls}
      href={ROUTES.artistProfile(id)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {name}
    </Link>
  );
}
