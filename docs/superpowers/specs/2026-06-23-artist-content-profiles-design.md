# Artist Content & Profiles — Design

**Date:** 2026-06-23
**Status:** Approved (design); spec under review
**Branch:** `worktree-artist-content-profiles`

## Problem

The catalog's tracks and artists *appear* to lack album art and artist data, but
the data plumbing already exists. Verified against the **live** catalog
(`GET https://www.tollroadmusic.xyz/api/v1/catalog`):

- 80 tracks, all with `coverImageKey` populated (`/covers/cat-track-<uuid>.svg`).
- 37 artists, 35 with `avatarKey`, 37 with `bio`.
- All cover/avatar SVGs return `200 image/svg+xml` from the live site.

The real gaps are **quality and missing features**, not absence:

1. Every cover is a generic auto-generated gradient-with-bars SVG; they look samey.
2. Artist bios are templated boilerplate; `location` is null for the seeded catalog.
3. **No public artist profile page** — listeners cannot view an artist (only the
   signed-in artist sees their own dashboard). Artist names are not clickable.
4. **No upload path** — real artists cannot add their own cover art or avatar, or
   edit their profile.

This is a real-startup feature, not demo-ware: artists must be able to manage
their own content and listeners must be able to browse artist profiles.

## Existing state (grounding)

- **Schema** (`infra/scripts/migrate-dsql.mjs`): `tracks.cover_image_key` (nullable),
  `artists` has `name, email, genre, bio, location, website, stripe_account_id,
  payouts_enabled, avatar_key, account_id`. No FKs (DSQL); app-side joins.
- **Backend domain** (`backend/src/domain/catalog.ts`): `CatalogTrack` (incl.
  `coverImageKey`), `CatalogArtist` (incl. `bio, location, website, avatarKey,
  genre, ...`). `ARTISTS_SQL`, `TRACKS_SQL` already select these.
- **Handlers** (`backend/src/handlers/`): `GET /v1/catalog`, `GET /v1/artists`,
  `POST /v1/artists` (create), `GET /v1/artist/summary` (signed-in dashboard).
  Artist↔account link via `artists.account_id`; the summary handler already
  resolves the signed-in artist's `artistId` from the session account.
- **Frontend**: `<CoverImage coverKey>` renders the key as `src` (relative →
  Next static `public/covers/`) with `onError` fallback to
  `/covers/placeholder.svg`. `TrackCard` shows `artistName` as plain text. The
  artist dashboard `app/(artist)/artist/page.tsx` shows only name + genre +
  earnings. No public artist route.
- **Image hosting today**: covers are static files in `frontend/public/covers/`,
  baked into the Vercel build. Audio is separate: private S3 (SSE-KMS) served via
  CloudFront **signed** URLs gated by the metering charge.

## Constraints (demo-week ops guardrails — from the audit)

- **Never** run bare `cdk deploy`. Infra changes go through the guarded
  `npm run deploy` (`infra/scripts/deploy.mjs`) only, which re-supplies secrets.
  A bare deploy truncates the CloudFront private key + session secret and 503s
  auth/streaming (recurred 2026-06-23).
- **Never** run `seed:reset` / `migrate-dsql` against the shared DSQL during demo
  week — it backs prod-demo data across every worktree. Feature writes are
  ordinary row `UPDATE`s (additive), which are fine.
- **Never** merge `ba-eth-global` (shelved divergent build).
- All work happens in this isolated worktree.

## Build order (two independently-mergeable tiers)

**Tier A — zero-infra, demo-critical. Build & merge first.**
1. Public artist profile page + clickable artist names.
2. Artist profile block on the signed-in dashboard.
3. Regenerate the 80 existing catalog covers to look good (static assets only).

**Tier B — the real upload flow. Build & merge second (needs one guarded deploy).**
4. New public images bucket + serving.
5. Presigned upload + commit endpoints (track covers, artist avatar).
6. Profile edit endpoint.
7. Dashboard upload/edit UI.

If artifact work (video/diagram/screenshot) eats the time, Tier A already carries
the demo.

---

## Tier A detail

### A1. Public artist profile

**Backend** — `GET /v1/catalog/artists/:id` (public, no auth, like `/catalog`):
returns the artist's profile fields + their tracks.

- New `domain/catalog.ts` function `getArtistProfile(id)`:
  - artist row via existing `ARTISTS_SQL` filtered by id (or a dedicated
    single-row query selecting the same columns).
  - tracks via the existing tracks-by-artist query (`TRACKS_SQL` filtered by
    `artist_id`).
  - Returns `{ artist: CatalogArtist, tracks: CatalogTrack[] }`, or `null` → 404.
- New handler in `handlers/catalog.ts`, wired in the router.

**Frontend**:
- New type `ArtistProfile = { artist: CatalogArtist; tracks: CatalogTrack[] }`
  in `frontend/lib/api/types.ts`; client method `getArtistProfile(id)`.
- New route `frontend/app/(listen)/artist/[id]/page.tsx`: avatar (via
  `<CoverImage>`), name, genre, location, bio, website link, and a track grid
  reusing the existing grid/`TrackCard`.
- `TrackCard` (and search results): wrap `artistName` in a link to
  `/artist/<artistId>`. Add a `routes.artist(id)` helper.

### A2. Artist dashboard profile block (read side)

- In `app/(artist)/artist/page.tsx`, render the artist's `bio, location, website,
  genre, avatar` above the earnings table. Read from the existing summary
  endpoint, extended to return these fields if not already present
  (`GET /v1/artist/summary` → include `bio, location, website, avatarKey`).

### A3. Regenerate catalog covers (static)

- Rewrite/extend the cover generator to produce varied, genre-aware SVGs (varied
  motifs, palettes, typography — not one gradient+bars template).
- Regenerate the existing **80** `cat-track-<uuid>.svg` and `cat-artist-*.svg`
  **in place** in `frontend/public/covers/`, preserving filenames so
  `cover_image_key`/`avatar_key` stay valid. **No DB or infra change.**
- Find/confirm the generator that produced the `cat-` assets; if it is not in the
  repo, add a committed script `infra/scripts/gen-catalog-covers.mjs` that reads
  the live catalog ids (or a committed manifest) and writes the SVGs.

---

## Tier B detail

### B1. Public images bucket (infra)

- In `infra/lib/tollroad-stack.ts`: new S3 bucket `tollroad-images-<account>`,
  **public-read** (or OAC + public CloudFront), `BlockPublicAccess` relaxed only
  as needed, CORS allowing browser `PUT` (presigned) from the app origins.
- A CloudFront distribution in front for HTTPS + caching (no trusted key groups —
  public). Output its domain.
- New env wiring: `TOLLROAD_IMAGES_BUCKET` (backend, for presigning) and
  `NEXT_PUBLIC_IMAGES_BASE` (frontend, the images CDN base URL).
- Bucket policy allows presigned `PUT` to `track-covers/*` and
  `artist-avatars/*` prefixes.
- **Deploy once** via `npm run deploy`. Afterward verify: auth 401 (not 503),
  streaming healthy, secrets intact (all env vars present).

### B2. Upload + commit endpoints (backend)

Ownership rule: the signed-in account resolves to an `artistId`
(`artists.account_id = session account`). A track is editable iff
`track.artist_id == artistId`.

- `POST /v1/artist/avatar/presign` `{ contentType }` → validate content-type
  (png/jpeg/webp) → presigned PUT to `artist-avatars/<artistId>-<rand>.<ext>` →
  return `{ uploadUrl, key }`.
- `POST /v1/artist/avatar/commit` `{ key }` → validate the key belongs to this
  artist's prefix → `UPDATE artists SET avatar_key = $key WHERE id = artistId`.
- `POST /v1/artist/cover/presign` `{ trackId, contentType }` → ownership check →
  presigned PUT to `track-covers/<trackId>-<rand>.<ext>` → `{ uploadUrl, key }`.
- `POST /v1/artist/cover/commit` `{ trackId, key }` → ownership + prefix check →
  `UPDATE tracks SET cover_image_key = $key WHERE id = trackId AND artist_id = artistId`.
- New `domain` helpers (e.g. `domain/artist-content.ts`) for the presign (AWS SDK
  S3 presigner) and the DB updates. **Convention (decided):** store the
  **bucket-relative key** (e.g. `track-covers/<id>-<rand>.jpg`, no leading slash,
  not an http URL) in `cover_image_key`/`avatar_key`. `<CoverImage>` resolves the
  three shapes: `http(s)://…` → as-is; leading-slash `/covers/*` → legacy Next
  static; otherwise → prefix with `NEXT_PUBLIC_IMAGES_BASE`. Storing the key (not
  a full URL) means the CDN domain can change without a data migration.

### B3. Profile edit endpoint (backend)

- `PATCH /v1/artist/profile` `{ bio?, location?, website?, genre? }` → validate
  (lengths, website is a URL) → `UPDATE artists SET ... WHERE id = artistId`.
  Only provided fields are updated.

### B4. Dashboard UI (frontend)

- Profile editor: edit `bio/location/website/genre`, avatar upload (presign →
  `PUT` file to S3 → commit → refresh).
- Per-track cover upload in the dashboard track list (presign → PUT → commit →
  refresh the row's cover).
- New client methods in `frontend/lib/api/client.ts` for each endpoint; a small
  reusable `uploadImage(presignFn, commitFn, file)` helper.

---

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `domain/catalog.getArtistProfile` | read one artist + tracks | DSQL |
| `handlers/catalog` (artist-by-id) | public artist endpoint | domain/catalog |
| `domain/artist-content` | presign URLs + cover/avatar/profile writes, ownership | S3 presigner, DSQL |
| `handlers/artist` (uploads, profile) | auth + ownership + call domain | domain/artist-content, jwt |
| `infra/tollroad-stack` (images) | provision public images bucket + CDN | CDK |
| FE `app/(listen)/artist/[id]` | render public profile | api client, CoverImage, TrackCard |
| FE dashboard profile/upload | edit profile, upload images | api client, uploadImage helper |
| FE `CoverImage` | resolve 3 key shapes → src | `NEXT_PUBLIC_IMAGES_BASE` |
| `gen-catalog-covers.mjs` | regenerate static catalog SVGs | (offline) |

## Error handling

- Public artist endpoint: 404 on unknown id; never leaks non-public fields
  (no `email`, `stripe_account_id`, `payout_ref`).
- Presign: 401 unauth, 403 if the artist doesn't own the track / has no artist
  row, 400 on bad content-type.
- Commit: 403 if key prefix doesn't match the caller's artist/track; idempotent
  (re-commit same key is a no-op success).
- Profile patch: 400 on invalid website/oversized fields; 403 if no artist row.
- Frontend uploads: surface presign/PUT/commit failures inline; optimistic UI
  only after commit succeeds; `<CoverImage>` keeps its placeholder fallback.

## Testing

- Backend unit/integration tests (Node test runner, matching existing
  `*.test.ts`):
  - `getArtistProfile`: returns tracks, 404 unknown, excludes private fields.
  - cover/avatar presign: ownership rejection (not-owner → 403; no artist row →
    403), content-type validation.
  - commit: updates only owned rows; prefix mismatch → 403; idempotent.
  - profile patch: partial update; website validation.
- Do **not** add/modify tests on the metering/charge path (out of scope, fragile).
- Manual verification (Tier B): after the single guarded deploy, upload a cover
  in the dashboard and confirm it renders on the track card and artist page
  in-browser; confirm auth + streaming still green.

## Out of scope (YAGNI for now)

- Image resizing/thumbnails/CDN transforms (store as uploaded; constrain size
  client-side).
- Migrating the existing 80 static covers into the images bucket (they stay
  static; only new uploads use the bucket).
- Follows/social, multi-image galleries, artist verification.
- Real Stripe payout changes, SES production access, Secrets-Manager hardening
  (tracked separately; not safe mid-week).

## Risks

- **Infra deploy (Tier B)** is the one risky step; mitigated by guarded deploy +
  post-deploy verification. If it can't be made safe in time, Tier A still ships.
- Two cover-hosting systems (legacy static + new bucket) coexist; `<CoverImage>`
  resolution logic is the single point that must handle both — covered by its key
  resolution + onError fallback.
- Writes target shared DSQL; they are additive row updates, not destructive
  scripts.
