// Canonical public, shareable URLs for songs and artists — the single source of
// truth used by the public landing pages, the sitemap, and the in-app Share
// buttons. Keeping construction here means a slug-format change never drifts
// between "where the link points" and "where the page resolves".
import type { Catalog, CatalogArtist, CatalogTrack } from "@/lib/api/types";
import { slugify } from "./slug.ts";

// Matches the root layout's metadataBase. Overridable for preview deploys.
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://tollroad.music").replace(/\/+$/, "");

/** The id's hex, dashes stripped — used both to build and to resolve song slugs. */
function normId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/** First 8 hex chars of a track id — enough to disambiguate same-titled songs. */
export function shortId(id: string): string {
  return normId(id).slice(0, 8);
}

/** "/s/midnight-drive--a1b2c3d4" — readable slug for SEO, trailing id for a
 *  stable, collision-proof resolve. slugify() never emits "--", so the last
 *  "--" is always our separator. */
export function songPath(track: Pick<CatalogTrack, "id" | "title">): string {
  return `/s/${slugify(track.title) || "song"}--${shortId(track.id)}`;
}

/** "/a/adhesion-scrap-heap" — mirrors the existing in-app /artists/<slug>. */
export function artistPath(artist: Pick<CatalogArtist, "id" | "name">): string {
  return `/a/${slugify(artist.name) || artist.id}`;
}

/** Absolute URL for sharing/canonical/OG (relative paths don't unfurl in texts). */
export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Pull the trailing id out of a song slug. Accepts both "slug--shortid" and a
 *  bare full UUID (legacy/fallback). Returns the normalized hex to match on. */
export function parseSongSlug(slug: string): { id: string } {
  const i = slug.lastIndexOf("--");
  return { id: normId(i >= 0 ? slug.slice(i + 2) : slug) };
}

/** Resolve a song slug to its track via the catalog, or null. Prefix-matches the
 *  trailing short id against each track id (a bare UUID matches in full). */
export function findTrack(catalog: Catalog, slug: string): CatalogTrack | null {
  const { id } = parseSongSlug(slug);
  if (!id) return null;
  return catalog.tracks.find((t) => normId(t.id).startsWith(id)) ?? null;
}

/** Resolve an artist slug to its artist: bare-id first, then slugify(name). */
export function findArtist(catalog: Catalog, slug: string): CatalogArtist | null {
  return (
    catalog.artists.find((a) => a.id === slug) ??
    catalog.artists.find((a) => slugify(a.name) === slug) ??
    null
  );
}

export type ShareTarget = { key: string; label: string; href: string };

/** "Share to <app>" deep links built from an absolute url + title. These are
 *  plain URLs / protocol handlers (sms:, mailto:, intent URLs) that work in
 *  EVERY browser with no Web Share or Clipboard API — which is exactly why the
 *  menu offers them: the old single-action button silently failed wherever
 *  navigator.share / navigator.clipboard were unavailable (e.g. insecure
 *  contexts). `title` and `url` are encoded here so callers pass raw strings. */
export function shareTargets(url: string, title: string): ShareTarget[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const tu = encodeURIComponent(`${title} ${url}`); // title + link, for body text
  return [
    { key: "sms", label: "Messages", href: `sms:?&body=${tu}` },
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${tu}` },
    { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "email", label: "Email", href: `mailto:?subject=${t}&body=${tu}` },
  ];
}
