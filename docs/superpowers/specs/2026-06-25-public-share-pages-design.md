# Public Share Pages — Design Spec

**Date:** 2026-06-25
**Status:** Approved, ready for implementation

## Problem

There is no public, link-shareable surface for music on TollRoad. When someone
wants to share a song (or an artist) — by text, in a tweet, in Slack — there is
no URL that:

1. Renders a clean landing page to a logged-out stranger (the current
   `/artists/[slug]` page is wrapped in the immersive dark app shell + player and
   is `force-dynamic`, which is the wrong first-touch experience and weak for SEO).
2. Produces a rich link-preview card (Open Graph / Twitter) when pasted into a
   messaging app.
3. Is indexable by search engines.

Songs have **no** dedicated page at all today.

## Goals

- Public, standalone landing pages for **songs** and **artists**, with no auth
  and no app shell.
- Rich link-preview metadata (OG + Twitter `summary_large_image`) with a
  **generated, branded 1200×630 preview card** per page.
- Web indexing: per-page canonical metadata, JSON-LD structured data,
  `sitemap.xml`, and `robots.txt`.
- In-app **Share** buttons that distribute these URLs (native share sheet on
  mobile, copy-to-clipboard on desktop).

## Non-Goals (YAGNI)

- **No audio playback on the landing page.** Card only. (Decision: preserves the
  metered pay-per-minute model; full free playback would undercut it.)
- No new backend endpoints — data comes from the existing `serverCatalog()`.
- No track-focused in-app player URL — the CTA deep-links to the existing
  `/artists/[slug]` in-app page.
- No comments/social features on the public page.

## Architecture

A new route group `app/(public)/` with a **minimal light layout** (fonts + a slim
TollRoad header/footer; explicitly NO sidebar, player, or auth button). The
`(public)` group does not inherit the `(listen)` dark app shell.

```
app/(public)/
  layout.tsx                       # minimal light shell (header + footer)
  s/[slug]/page.tsx                # song landing page  (+ generateMetadata)
  s/[slug]/opengraph-image.tsx     # generated 1200x630 card for the song
  a/[slug]/page.tsx                # artist landing page (+ generateMetadata)
  a/[slug]/opengraph-image.tsx     # generated 1200x630 card for the artist
app/sitemap.ts                     # every song + artist URL from the catalog
app/robots.ts                      # allow indexing, point at the sitemap
```

### Rendering

- Server components with `generateMetadata`.
- **ISR** via `export const revalidate = 3600` (not `force-dynamic`): crawlers and
  unfurlers get fast cached HTML; catalog refreshes hourly.
- Pages render fully without client JS (crawler-friendly).

### Slug strategy

Songs have only UUIDs today, and titles are not unique. Public song URLs are:

```
/s/<slugify(title)>--<shortId>      e.g.  /s/midnight-drive--a1b2c3d4
```

- `shortId` = first 8 chars of the track UUID. The trailing id guarantees a
  unique, stable resolve even when two songs share a title; the slug prefix is
  purely for SEO/readability.
- Resolver: split on the last `--`, match the short id against
  `track.id.startsWith(shortId)` from `serverCatalog()`. If no `--` is present,
  accept a bare full UUID as a legacy/fallback form.

Artists reuse existing resolution: `/a/<slugify(name)>`, resolved by matching
`slugify(artist.name)` against the catalog, with bare-UUID fallback (mirrors the
existing `/artists/[slug]` logic in `lib/slug.ts`).

URL construction lives in one place: `lib/shareUrls.ts` (used by pages, sitemap,
and share buttons — single source of truth).

## Components & Data Flow

### `lib/shareUrls.ts` (new)
- `songPath(track) -> "/s/<slug>--<shortId>"`
- `artistPath(artist) -> "/a/<slug>"`
- `absoluteUrl(path) -> "https://tollroad.music<path>"` (uses `metadataBase`
  origin; for share buttons we need absolute URLs)
- `parseSongSlug(slug) -> { shortId | uuid }` and a `findTrack(catalog, slug)`
  helper; matching artist resolver `findArtist(catalog, slug)`.

### Song page — `s/[slug]/page.tsx`
- `await serverCatalog()`, resolve the track via `findTrack`; `notFound()` if missing.
- Renders: large cover (`resolveCoverSrc(coverImageKey)`, gradient fallback when
  null), title, artist name (links to `artistPath`), secondary line
  `genre · m:ss · 1¢/min`, primary CTA **"Listen on TollRoad"** →
  `/artists/<artistSlug>`, slim header/footer.
- Emits JSON-LD `MusicRecording` (name, byArtist, duration ISO-8601, image, url).

### Artist page — `a/[slug]/page.tsx`
- `await serverCatalog()` + `findArtist`; `notFound()` if missing.
- Renders: avatar (`resolveCoverSrc(avatarKey)`), name, `location · genre`,
  truncated bio, a grid/list of the artist's tracks (cover + title) each linking
  to its `songPath` (gives crawlers internal links to every song), same CTA.
- Emits JSON-LD `MusicGroup` (name, image, url, genre).

### `generateMetadata` (both pages)
- `title`, `description`, `alternates.canonical`, `openGraph`
  (`type: "music.song"` / `"profile"`, `title`, `description`, `url`), `twitter`
  (`card: "summary_large_image"`). OG image is supplied automatically by the
  colocated `opengraph-image.tsx`.
- `notFound()` paths return minimal metadata.

### `opengraph-image.tsx` (both pages)
- Next.js `ImageResponse`, `size = { width: 1200, height: 630 }`,
  `contentType = "image/png"`, edge runtime.
- Composes: cover art (fetched from the CDN at render time) beside title +
  artist + small "TollRoad" wordmark + metered price tag, over the brand dark
  gradient. Fallback (no cover) = gradient + text only.

### `sitemap.ts` / `robots.ts`
- `sitemap.ts`: `serverCatalog()` → one entry per artist (`artistPath`) and per
  track (`songPath`), plus the marketing home. `lastModified` omitted or static.
- `robots.ts`: `allow: "/"`, `sitemap: absoluteUrl("/sitemap.xml")`. Disallow the
  in-app `/api`, `/wallet`, `/library` etc. paths from indexing.

### `<ShareButton url title />` (new client component)
- `navigator.share({ title, url })` when available (mobile native sheet);
  otherwise `navigator.clipboard.writeText(url)` + a transient "Copied!" state.
- Placed on: track rows (browse/library/search), the global player now-playing
  bar, and the in-app artist profile view. URLs built via `lib/shareUrls.ts`.

## Error Handling

- Unresolvable slug → `notFound()` (Next renders the standard 404; metadata
  returns a generic title).
- Null cover/avatar → gradient fallback in both the page and the OG image.
- OG cover fetch failure → text-only fallback card (never throws the route).
- Missing `NEXT_PUBLIC_IMAGES_BASE` → `resolveCoverSrc` already returns the key
  as-is / null; pages still render with fallback art.

## Testing

- `lib/shareUrls.test.ts` (node:test, mirrors `coverSrc.test.ts`):
  `songPath`/`artistPath` build, `parseSongSlug` round-trips
  `slugify(title)--shortId`, collision handling (two tracks, same title,
  different ids), missing-cover path, bare-UUID fallback.
- `generateMetadata` returns expected OG/Twitter fields for a known fixture
  track and artist.
- Render smoke: song + artist pages render CTA + title text with JS disabled
  (server output contains them).
- Manual: validate the generated OG card in a link-preview debugger before
  marking complete.

## Rollout / Config

- Relies on existing `NEXT_PUBLIC_IMAGES_BASE` and `metadataBase`
  (`https://tollroad.music`) already set in the root layout. No new env vars.
- No DB migration, no backend change.
