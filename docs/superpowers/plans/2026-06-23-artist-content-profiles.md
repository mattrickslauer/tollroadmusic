# Artist Content & Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give listeners public artist profile pages and give artists self-service control of their cover art, avatar, and profile data — backed by a new public images bucket — while refreshing the existing catalog cover art.

**Architecture:** Backend is a tiny router (`backend/src/router.ts`) of `compile(method, path, handler)` routes over Aurora DSQL (`query<T>(sql, params)`). Frontend is Next.js App Router: SSR pages fetch via `lib/api/server.ts` (direct to `TOLLROAD_API_BASE`); browser interactivity calls `lib/api/client.ts` (`req<T>()` → `/api/v1` proxy). Uploaded images live in a new public S3 bucket fronted by a public CloudFront distribution; the DB stores bucket-relative keys, resolved client-side via `NEXT_PUBLIC_IMAGES_BASE`.

**Tech Stack:** TypeScript, Node 20, `node:test` + `node:assert/strict`, Aurora DSQL via `pg`, AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` to be added), AWS CDK `aws-cdk-lib ^2.160` (L2 constructs), Next.js App Router (React server + client components).

## Global Constraints

- **Never run bare `cdk deploy` / `npm run deploy:raw`.** Infra deploys go through `cd infra && npm run deploy` only (guarded `deploy.mjs`, re-supplies secrets, escapes PEM newlines). A bare deploy truncates `TOLLROAD_CF_PRIVATE_KEY` + `TOLLROAD_SESSION_SECRET` and 503s auth/streaming.
- **Never run `npm run seed:reset` / `npm run migrate` against DSQL this week.** It backs shared prod-demo data across worktrees. Feature DB writes are ordinary `UPDATE`s only.
- **Never merge `ba-eth-global`.** Shelved divergent build.
- All work in worktree `worktree-artist-content-profiles`.
- Backend tests run with: `cd backend && npm test` (`node --experimental-strip-types --test src/**/*.test.ts`).
- DB column ↔ TS field convention: snake_case columns mapped to camelCase in domain mappers.
- Image key convention (decided): store **bucket-relative keys** (e.g. `track-covers/<id>-<rand>.jpg`, no leading slash, not an http URL). `CoverImage` resolves: `http(s)://…`→as-is; leading-slash `/covers/*`→legacy Next static; else→`${NEXT_PUBLIC_IMAGES_BASE}/${key}`.
- Public artist endpoint must NEVER return private fields: no `email`, `stripe_account_id`, `payout_ref`, `account_id`.
- Allowed upload content-types: `image/png`, `image/jpeg`, `image/webp`.

---

## File Structure

**Tier A — zero infra (build & merge first)**
- Create `backend/src/domain/artist-public.ts` — `getArtistProfile(id)` (public read).
- Modify `backend/src/handlers/catalog.ts` — add `artistById` handler.
- Modify `backend/src/router.ts` — add `GET /artists/{id}`.
- Create `backend/src/domain/artist-public.test.ts` — shape/field-exclusion tests (pure mapper).
- Create `frontend/lib/coverSrc.ts` — `resolveCoverSrc(key, base)` pure resolver.
- Create `frontend/lib/coverSrc.test.ts` — resolver tests.
- Modify `frontend/components/listen/CoverImage.tsx` — use `resolveCoverSrc`.
- Modify `frontend/lib/api/types.ts` — add `ArtistProfile`.
- Modify `frontend/lib/api/server.ts` — add `serverArtistProfile(id)`.
- Modify `frontend/lib/api/client.ts` — add `getArtist(id)`.
- Create `frontend/app/(listen)/artists/[id]/page.tsx` — public profile page.
- Create `frontend/components/listen/ArtistProfileView.tsx` — profile render (client; reuses `TrackCard`).
- Modify `frontend/lib/routes.ts` — add `artistProfile(id)`.
- Modify `frontend/components/listen/TrackCard.tsx` — clickable artist name.
- Modify `backend/src/domain/accounts.ts` — widen artist `SELECT` in `getProfiles` to include `location, bio, website, avatar_key`.
- Modify `frontend/app/(artist)/artist/page.tsx` — render profile block (bio/location/website/avatar).
- Create `infra/scripts/gen-catalog-covers.mjs` — regenerate the live catalog's `cat-*` SVGs.
- Modify `infra/package.json` — add `seed:catalog-covers` script.

**Tier B — upload flow (needs one guarded deploy)**
- Modify `backend/package.json` — add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- Create `backend/src/domain/artist-content.ts` — presign + ownership + DB writes.
- Create `backend/src/domain/artist-content.test.ts` — pure-logic tests.
- Create `backend/src/handlers/artist-content.ts` — 5 handlers.
- Modify `backend/src/router.ts` — add 5 routes.
- Modify `backend/src/router.test.ts` (or `x402.test.ts`) — route-match assertions for new routes.
- Modify `infra/lib/tollroad-stack.ts` — images bucket + CloudFront + env + output + grant.
- Modify `frontend/lib/api/client.ts` — 5 upload/profile methods + `uploadImage` helper.
- Create `frontend/components/artist/ProfileEditor.tsx` — client editor (profile + avatar + per-track cover).
- Modify `frontend/app/(artist)/artist/page.tsx` — mount `ProfileEditor`.
- Modify `frontend/.env.example` — `NEXT_PUBLIC_IMAGES_BASE`.

---

# TIER A

### Task 1: Public artist profile endpoint

**Files:**
- Create: `backend/src/domain/artist-public.ts`
- Create: `backend/src/domain/artist-public.test.ts`
- Modify: `backend/src/handlers/catalog.ts`
- Modify: `backend/src/router.ts`

**Interfaces:**
- Produces: `getArtistProfile(id: string): Promise<{ artist: PublicArtist; tracks: CatalogTrack[] } | null>` where
  `PublicArtist = { id; name; genre: string|null; location: string|null; bio: string|null; website: string|null; avatarKey: string|null; trackCount: number }`.
  `CatalogTrack` is the existing type from `domain/catalog.ts`.
- Produces handler `artistById: Handler` exported from `handlers/catalog.ts`.

- [ ] **Step 1: Write the failing test** (`backend/src/domain/artist-public.test.ts`)

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPublicArtist, mapArtistTracks } from "./artist-public.ts";

test("mapPublicArtist exposes only public fields", () => {
  const row = {
    id: "a1", name: "Nova", genre: "Synthwave", location: "LA",
    bio: "hi", website: "https://nova.fm", avatar_key: "artist-avatars/a1.jpg",
    email: "secret@x.com", stripe_account_id: "acct_x", account_id: "u1",
  };
  const out = mapPublicArtist(row, 3);
  assert.deepEqual(out, {
    id: "a1", name: "Nova", genre: "Synthwave", location: "LA",
    bio: "hi", website: "https://nova.fm", avatarKey: "artist-avatars/a1.jpg",
    trackCount: 3,
  });
  assert.equal((out as Record<string, unknown>).email, undefined);
  assert.equal((out as Record<string, unknown>).stripeAccountId, undefined);
});

test("mapArtistTracks maps snake_case to CatalogTrack camelCase", () => {
  const rows = [{
    id: "t1", title: "Drift", artist_id: "a1", artist_name: "Nova",
    genre: "Synthwave", duration_seconds: 180, price_per_minute_cents: 1,
    cover_image_key: "track-covers/t1.jpg",
  }];
  const out = mapArtistTracks(rows);
  assert.equal(out[0].artistId, "a1");
  assert.equal(out[0].durationSeconds, 180);
  assert.equal(out[0].coverImageKey, "track-covers/t1.jpg");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --experimental-strip-types --test src/domain/artist-public.test.ts`
Expected: FAIL — cannot find module `./artist-public.ts`.

- [ ] **Step 3: Write minimal implementation** (`backend/src/domain/artist-public.ts`)

```typescript
// Public artist profile — listener-facing read. Exposes ONLY public columns
// (never email / stripe_account_id / account_id).
import { query } from "../lib/dsql.ts";
import type { CatalogTrack } from "./catalog.ts";

export type PublicArtist = {
  id: string;
  name: string;
  genre: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  avatarKey: string | null;
  trackCount: number;
};

const ARTIST_SQL = `
  SELECT id, name, genre, location, bio, website, avatar_key
  FROM artists WHERE id = $1 LIMIT 1`;

const TRACKS_SQL = `
  SELECT t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
         t.duration_seconds, t.price_per_minute_cents, t.cover_image_key
  FROM tracks t JOIN artists a ON a.id = t.artist_id
  WHERE t.artist_id = $1
  ORDER BY t.title`;

export function mapPublicArtist(r: Record<string, any>, trackCount: number): PublicArtist {
  return {
    id: r.id, name: r.name, genre: r.genre, location: r.location,
    bio: r.bio, website: r.website, avatarKey: r.avatar_key, trackCount,
  };
}

export function mapArtistTracks(rows: Record<string, any>[]): CatalogTrack[] {
  return rows.map((r) => ({
    id: r.id, title: r.title, artistId: r.artist_id, artistName: r.artist_name,
    genre: r.genre, durationSeconds: r.duration_seconds,
    pricePerMinuteCents: r.price_per_minute_cents, coverImageKey: r.cover_image_key,
  }));
}

export async function getArtistProfile(
  id: string,
): Promise<{ artist: PublicArtist; tracks: CatalogTrack[] } | null> {
  const aR = await query(ARTIST_SQL, [id]);
  if (!aR.rows[0]) return null;
  const tR = await query(TRACKS_SQL, [id]);
  const tracks = mapArtistTracks(tR.rows as Record<string, any>[]);
  return { artist: mapPublicArtist(aR.rows[0] as Record<string, any>, tracks.length), tracks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --experimental-strip-types --test src/domain/artist-public.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the handler** (`backend/src/handlers/catalog.ts`) — follow the existing handler style in that file (`ok`, `error`, `503` guards). Add:

```typescript
import { getArtistProfile } from "../domain/artist-public.ts";

export const artistById: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "catalog not configured");
  const id = req.params.id;
  if (!id) return error(400, "id required");
  const profile = await getArtistProfile(id);
  if (!profile) return error(404, "no such artist");
  return ok(profile);
};
```
(Reuse the file's existing imports for `Handler`, `ok`, `error`, `dsqlConfigured`. If `dsqlConfigured` is imported from `../lib/dsql.ts` elsewhere in the file, match that.)

- [ ] **Step 6: Register the route** (`backend/src/router.ts`) — add to the `ROUTES` array, AFTER `GET /artists` (more specific static route stays first; `{id}` is fine after):

```typescript
  compile("GET", "/artists/{id}", catalog.artistById),
```

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 8: Commit**

```bash
git add backend/src/domain/artist-public.ts backend/src/domain/artist-public.test.ts backend/src/handlers/catalog.ts backend/src/router.ts
git commit -m "feat(api): public artist profile endpoint GET /artists/:id"
```

---

### Task 2: CoverImage images-base resolution

**Files:**
- Create: `frontend/lib/coverSrc.ts`
- Create: `frontend/lib/coverSrc.test.ts`
- Modify: `frontend/components/listen/CoverImage.tsx`

**Interfaces:**
- Produces: `resolveCoverSrc(key: string | null | undefined, base?: string): string | null` — returns a usable `src` or `null` (caller shows placeholder).

- [ ] **Step 1: Write the failing test** (`frontend/lib/coverSrc.test.ts`)

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCoverSrc } from "./coverSrc.ts";

test("null/empty -> null (placeholder handled by caller)", () => {
  assert.equal(resolveCoverSrc(null, "https://img.cdn"), null);
  assert.equal(resolveCoverSrc("", "https://img.cdn"), null);
});
test("absolute http(s) URL passes through", () => {
  assert.equal(resolveCoverSrc("https://x/y.jpg", "https://img.cdn"), "https://x/y.jpg");
});
test("leading-slash legacy path passes through (Next static)", () => {
  assert.equal(resolveCoverSrc("/covers/cat-track-1.svg", "https://img.cdn"), "/covers/cat-track-1.svg");
});
test("bucket-relative key is prefixed with images base", () => {
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", "https://img.cdn"), "https://img.cdn/track-covers/t1.jpg");
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", "https://img.cdn/"), "https://img.cdn/track-covers/t1.jpg");
});
test("bucket-relative key with no base falls back to leading-slash static", () => {
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", ""), "/track-covers/t1.jpg");
});
```

- [ ] **Step 2: Verify the frontend can run node:test on TS.** Run:
`cd frontend && node --experimental-strip-types --test lib/coverSrc.test.ts`
Expected: FAIL — module not found. (If the runtime rejects TS strip on this Node, add `"test": "node --experimental-strip-types --test lib/**/*.test.ts"` to `frontend/package.json` and use `npm test`; if still unsupported, keep the helper + test but run via the backend's Node — note the resolver is plain TS with no Next imports.)

- [ ] **Step 3: Implement** (`frontend/lib/coverSrc.ts`)

```typescript
// Resolve a stored cover/avatar key to an <img> src.
//  - http(s)://…            -> as-is (already absolute)
//  - /covers/…  (leading /) -> as-is (legacy Next static assets)
//  - bucket-relative key    -> `${base}/${key}` (uploaded images CDN)
// Returns null when there is no key, so the caller can show its placeholder.
export function resolveCoverSrc(
  key: string | null | undefined,
  base: string = process.env.NEXT_PUBLIC_IMAGES_BASE ?? "",
): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  if (key.startsWith("/")) return key;
  const b = base.replace(/\/+$/, "");
  return b ? `${b}/${key}` : `/${key}`;
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS (5 tests).

- [ ] **Step 5: Use it in CoverImage** (`frontend/components/listen/CoverImage.tsx`) — replace the `src` computation:

```typescript
import { resolveCoverSrc } from "@/lib/coverSrc";
// ...
  const [broken, setBroken] = useState(false);
  const resolved = resolveCoverSrc(coverKey);
  const src = broken || !resolved ? PLACEHOLDER : resolved;
```
(Keep the rest of the component — `onError`, props — unchanged.)

- [ ] **Step 6: Verify the frontend still builds**

Run: `cd frontend && npx tsc --noEmit` (or the project's typecheck script if present)
Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/coverSrc.ts frontend/lib/coverSrc.test.ts frontend/components/listen/CoverImage.tsx
git commit -m "feat(web): resolve cover keys against NEXT_PUBLIC_IMAGES_BASE"
```

---

### Task 3: Public artist profile page

**Files:**
- Modify: `frontend/lib/api/types.ts`
- Modify: `frontend/lib/api/server.ts`
- Modify: `frontend/lib/api/client.ts`
- Modify: `frontend/lib/routes.ts`
- Create: `frontend/components/listen/ArtistProfileView.tsx`
- Create: `frontend/app/(listen)/artists/[id]/page.tsx`

**Interfaces:**
- Consumes: backend `GET /artists/{id}` → `{ artist: PublicArtist; tracks: CatalogTrack[] }` (Task 1).
- Produces: `ArtistProfile` type; `serverArtistProfile(id)`, `getArtist(id)`; `ROUTES.artistProfile(id)`.

- [ ] **Step 1: Add the type** (`frontend/lib/api/types.ts`)

```typescript
export type ArtistProfile = {
  artist: {
    id: string; name: string; genre: string | null; location: string | null;
    bio: string | null; website: string | null; avatarKey: string | null; trackCount: number;
  };
  tracks: CatalogTrack[];
};
```

- [ ] **Step 2: Add the route helper** (`frontend/lib/routes.ts`) — add to the `ROUTES` object:

```typescript
  artistProfile: (id: string) => `/artists/${encodeURIComponent(id)}`,
```

- [ ] **Step 3: Add the server fetch** (`frontend/lib/api/server.ts`) — follow the existing `serverArtistSummary`/`serverCatalog` pattern in that file (same base-URL + header plumbing). Add:

```typescript
export async function serverArtistProfile(id: string): Promise<ArtistProfile | null> {
  // mirror serverCatalog's fetch; return null on 404
  // (use the same helper the other server* fns use; on non-OK 404 return null, else throw)
}
```
Implement it by copying the body of the nearest `server*` function and swapping the path to `/artists/${encodeURIComponent(id)}`, returning `null` when the response status is 404.

- [ ] **Step 4: Add the client method** (`frontend/lib/api/client.ts`):

```typescript
export const getArtist = (id: string) => req<ArtistProfile>(`/artists/${encodeURIComponent(id)}`);
```
(Import `ArtistProfile` from `./types`.)

- [ ] **Step 5: Build the view component** (`frontend/components/listen/ArtistProfileView.tsx`) — client component. Renders: avatar via `<CoverImage coverKey={artist.avatarKey} />`, name (`h1`), a meta line (genre · location), `bio`, a `website` link (only if present, `rel="noopener noreferrer" target="_blank"`), then the track grid reusing existing markup — map `tracks` to `<TrackCard track={t} queue={tracks} key={t.id} />`. Match the class names used in `BrowseView`/existing listen views for visual consistency.

- [ ] **Step 6: Build the page** (`frontend/app/(listen)/artists/[id]/page.tsx`) — server component, following `app/(listen)/browse/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import ArtistProfileView from "@/components/listen/ArtistProfileView";
import { serverArtistProfile, apiConfigured } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!apiConfigured()) return <p className="lx-empty">Not configured.</p>;
  const profile = await serverArtistProfile(id);
  if (!profile) notFound();
  return <ArtistProfileView profile={profile} />;
}
```

- [ ] **Step 7: Verify build + route**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean. (Confirm `/artists/[id]` does not collide with `/artist` or `/artist/join` — it is a separate plural path.)

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/api/types.ts frontend/lib/api/server.ts frontend/lib/api/client.ts frontend/lib/routes.ts frontend/components/listen/ArtistProfileView.tsx "frontend/app/(listen)/artists/[id]/page.tsx"
git commit -m "feat(web): public artist profile page /artists/[id]"
```

---

### Task 4: Clickable artist names

**Files:**
- Modify: `frontend/components/listen/TrackCard.tsx`

- [ ] **Step 1: Make the artist name a link** — replace the artist line (currently `<div className="lx-card-artist">{track.artistName}</div>`) with a Next `Link` to the profile, preserving the class:

```typescript
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
// ...
        <Link className="lx-card-artist" href={ROUTES.artistProfile(track.artistId)}>
          {track.artistName}
        </Link>
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Apply the same link in search results if a separate component renders artist names** — grep `artistName` under `frontend/components/`; if another component (e.g. a search row) prints it as plain text, wrap it identically. If none, skip.

Run: `cd frontend && grep -rn "artistName" components/ app/`

- [ ] **Step 4: Commit**

```bash
git add frontend/components/listen/TrackCard.tsx
git commit -m "feat(web): link artist names to their profile page"
```

---

### Task 5: Artist dashboard profile block (read side)

**Files:**
- Modify: `backend/src/domain/accounts.ts`
- Modify: `frontend/lib/api/types.ts`
- Modify: `frontend/app/(artist)/artist/page.tsx`

**Interfaces:**
- `getProfiles(accountId)`'s `artist` object widens from `{ id, name, genre }` to `{ id, name, genre, location, bio, website, avatarKey }`. `ArtistSummary.artist` (frontend type) widens to match.

- [ ] **Step 1: Widen the SELECT** (`backend/src/domain/accounts.ts`) — in `getProfiles`, change the artist query from `SELECT id, name, genre FROM artists WHERE account_id = $1 LIMIT 1` to:

```sql
SELECT id, name, genre, location, bio, website, avatar_key FROM artists WHERE account_id = $1 LIMIT 1
```
and map `avatar_key` → `avatarKey` in the returned object (and pass `location, bio, website` through). Update the `ArtistProfile` TS type in that file accordingly.

- [ ] **Step 2: Run backend tests** (ensure nothing referencing the old shape breaks)

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 3: Widen the frontend type** (`frontend/lib/api/types.ts`) — change `ArtistSummary.artist` to:

```typescript
  artist: { id: string; name: string; genre: string | null; location: string | null; bio: string | null; website: string | null; avatarKey: string | null };
```

- [ ] **Step 4: Render the profile block** (`frontend/app/(artist)/artist/page.tsx`) — between the `<header>` and the `<div className="az-stats">`, when `summary` exists, render a profile card: `<CoverImage coverKey={summary.artist.avatarKey} className="az-avatar" />`, name, genre · location, bio paragraph, website link (if present). Use existing `az-*` class conventions; add minimal classes if needed. (Read-only here; editing is Task 12.)

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/accounts.ts frontend/lib/api/types.ts "frontend/app/(artist)/artist/page.tsx"
git commit -m "feat: surface artist bio/location/website/avatar on the dashboard"
```

---

### Task 6: Refresh catalog cover art

**Files:**
- Create: `infra/scripts/gen-catalog-covers.mjs`
- Modify: `infra/package.json`
- (Regenerated assets) `frontend/public/covers/cat-*.svg`

**Context:** The live catalog references `/covers/cat-track-<uuid>.svg` and `/covers/cat-artist-<slug>.svg` (committed in `frontend/public/covers/`). No in-repo script generates these. This task adds a generator that **reads the live catalog** for the exact filenames + seeds, and rewrites those same files with nicer, genre-aware art (filenames unchanged → no DB/infra change). Reuse the SVG approach from `infra/scripts/gen-demo-assets.mjs` (`hues`, `artistCover`, `trackCover`) but improve variety (genre-driven palettes, varied motifs).

- [ ] **Step 1: Write the generator** (`infra/scripts/gen-catalog-covers.mjs`)

```javascript
// Regenerate the live catalog's cover/avatar SVGs in place (same filenames).
// Reads the deployed catalog so the exact cat-*.svg names are covered.
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COVER_DIR = resolve(HERE, "..", "..", "frontend", "public", "covers");
const CATALOG_URL = process.env.CATALOG_URL ?? "https://www.tollroadmusic.xyz/api/v1/catalog";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function hash(seed) { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
// Genre-anchored base hue so a genre reads as a palette family; track/title varies within it.
const GENRE_HUE = { Synthwave: 280, Jazz: 35, "Afro-Soul": 20, Downtempo: 200, Ambient: 190, "Lo-Fi": 150, Folk: 90, Electronic: 250, House: 320, Classical: 50 };
function palette(genre, seed) {
  const base = GENRE_HUE[genre] ?? (hash(genre ?? "x") % 360);
  const h = hash(seed);
  const h1 = (base + (h % 30)) % 360;
  const h2 = (base + 30 + ((h >> 8) % 60)) % 360;
  return [h1, h2];
}
function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "♪";
}
function artistCover(name, genre) {
  const [h1, h2] = palette(genre, name);
  const id = "g" + Math.abs(h1 * 7 + h2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1} 60% 30%)"/><stop offset="1" stop-color="hsl(${h2} 68% 16%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
<circle cx="320" cy="90" r="150" fill="hsl(${h2} 80% 62%)" opacity="0.16"/>
<circle cx="70" cy="330" r="120" fill="hsl(${h1} 80% 70%)" opacity="0.12"/>
<text x="200" y="208" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#fff" fill-opacity="0.92" text-anchor="middle" dominant-baseline="central">${esc(initials(name))}</text>
</svg>`;
}
function trackCover(seed, genre) {
  const [h1, h2] = palette(genre, seed);
  const id = "g" + Math.abs(h1 * 13 + h2 + 1);
  let r = hash(seed) || 1;
  const next = () => (r = (r * 1103515245 + 12345) >>> 0);
  // A varied motif: concentric arcs + a few accent dots, instead of the old uniform bars.
  const dots = Array.from({ length: 7 }, (_, i) => {
    next(); const cx = 50 + (r % 300); next(); const cy = 60 + (r % 280); next();
    const rad = 8 + (r % 26);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#fff" fill-opacity="${(0.12 + (r % 30) / 100).toFixed(2)}"/>`;
  }).join("");
  const rings = Array.from({ length: 3 }, (_, i) =>
    `<circle cx="200" cy="210" r="${60 + i * 46}" fill="none" stroke="#fff" stroke-opacity="${(0.22 - i * 0.05).toFixed(2)}" stroke-width="3"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
<stop offset="0" stop-color="hsl(${h1} 70% 24%)"/><stop offset="1" stop-color="hsl(${h2} 74% 13%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
${dots}${rings}
</svg>`;
}
const fileOf = (key) => key.split("/").pop();

const res = await fetch(CATALOG_URL);
if (!res.ok) { console.error("catalog fetch failed", res.status); process.exit(1); }
const { artists, tracks } = await res.json();
await mkdir(COVER_DIR, { recursive: true });
let n = 0;
for (const a of artists) {
  if (!a.avatarKey || !a.avatarKey.startsWith("/covers/")) continue;
  await writeFile(resolve(COVER_DIR, fileOf(a.avatarKey)), artistCover(a.name, a.genre)); n++;
}
for (const t of tracks) {
  if (!t.coverImageKey || !t.coverImageKey.startsWith("/covers/")) continue;
  await writeFile(resolve(COVER_DIR, fileOf(t.coverImageKey)), trackCover(t.title + t.id, t.genre)); n++;
}
console.log(`regenerated ${n} catalog SVGs in ${COVER_DIR}`);
```

- [ ] **Step 2: Add the npm script** (`infra/package.json` scripts):

```json
    "seed:catalog-covers": "node scripts/gen-catalog-covers.mjs",
```

- [ ] **Step 3: Run it**

Run: `cd infra && npm run seed:catalog-covers`
Expected: `regenerated 11X catalog SVGs ...` (≈80 track + ≈35 artist files).

- [ ] **Step 4: Spot-check one SVG** opens and looks varied (not the old uniform bars). Run:
`git -C .. status --short frontend/public/covers/ | head` and confirm modified `cat-*.svg` files.

- [ ] **Step 5: Commit**

```bash
git add infra/scripts/gen-catalog-covers.mjs infra/package.json frontend/public/covers/
git commit -m "feat(catalog): refreshed genre-aware cover art for the live catalog"
```

---

### Tier A checkpoint

- [ ] Run `cd backend && npm test` (PASS) and `cd frontend && npx tsc --noEmit` (clean).
- [ ] Optional local smoke: run the frontend dev server, visit `/browse`, click an artist name → `/artists/[id]` renders avatar/bio/tracks; covers look refreshed.
- [ ] **Tier A is independently mergeable to `main`.** Hold the merge until the human reviews, or proceed per the execution skill's checkpoints.

---

# TIER B

### Task 7: Add S3 deps + presign helper

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/domain/artist-content.ts` (presign + validation parts)
- Create: `backend/src/domain/artist-content.test.ts`

**Interfaces:**
- Produces: `extForContentType(ct: string): string | null`; `buildImageKey(prefix: "track-covers"|"artist-avatars", id: string, ext: string, rand: string): string`; `presignImagePut(key: string, contentType: string): Promise<string>`.

- [ ] **Step 1: Write failing tests** (`backend/src/domain/artist-content.test.ts`)

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { extForContentType, buildImageKey } from "./artist-content.ts";

test("extForContentType allows png/jpeg/webp only", () => {
  assert.equal(extForContentType("image/png"), "png");
  assert.equal(extForContentType("image/jpeg"), "jpg");
  assert.equal(extForContentType("image/webp"), "webp");
  assert.equal(extForContentType("image/gif"), null);
  assert.equal(extForContentType("text/html"), null);
});

test("buildImageKey is prefix-scoped and deterministic in shape", () => {
  const k = buildImageKey("track-covers", "t1", "jpg", "abcd");
  assert.equal(k, "track-covers/t1-abcd.jpg");
  assert.ok(k.startsWith("track-covers/"));
});
```

- [ ] **Step 2: Run → FAIL** (`cd backend && node --experimental-strip-types --test src/domain/artist-content.test.ts`).

- [ ] **Step 3: Add deps** (`backend/package.json` dependencies — match existing `^3.10xx` line style):

```json
    "@aws-sdk/client-s3": "^3.1070.0",
    "@aws-sdk/s3-request-presigner": "^3.1070.0",
```
Then: `cd backend && npm install`.

- [ ] **Step 4: Implement the pure parts + presign** (`backend/src/domain/artist-content.ts`)

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const IMAGES_BUCKET = process.env.TOLLROAD_IMAGES_BUCKET;

const CT_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
export function extForContentType(ct: string): string | null {
  return CT_EXT[ct] ?? null;
}
export function buildImageKey(
  prefix: "track-covers" | "artist-avatars", id: string, ext: string, rand: string,
): string {
  return `${prefix}/${id}-${rand}.${ext}`;
}
export function imagesConfigured(): boolean {
  return Boolean(IMAGES_BUCKET);
}
let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}
export async function presignImagePut(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: IMAGES_BUCKET!, Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: 300 });
}
```

- [ ] **Step 5: Run → PASS** (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/domain/artist-content.ts backend/src/domain/artist-content.test.ts
git commit -m "feat(api): S3 image presign helper + content-type validation"
```

---

### Task 8: Ownership + DB write helpers

**Files:**
- Modify: `backend/src/domain/artist-content.ts`
- Modify: `backend/src/domain/artist-content.test.ts`

**Interfaces:**
- Produces: `artistIdForAccount(accountId): Promise<string|null>`; `ownsTrack(artistId, trackId): Promise<boolean>`; `setTrackCover(artistId, trackId, key): Promise<boolean>`; `setArtistAvatar(artistId, key): Promise<void>`; `updateArtistProfile(artistId, fields): Promise<void>`; `sanitizeProfile(input): { bio?, location?, website?, genre? }` (pure; throws `HttpError(400)` on invalid website/oversize).

- [ ] **Step 1: Add failing tests for the pure validator**

```typescript
import { sanitizeProfile } from "./artist-content.ts";
test("sanitizeProfile passes valid fields and trims", () => {
  const out = sanitizeProfile({ bio: " hi ", website: "https://a.com", genre: "Jazz", location: "NYC" });
  assert.deepEqual(out, { bio: "hi", website: "https://a.com", genre: "Jazz", location: "NYC" });
});
test("sanitizeProfile rejects non-http website", () => {
  assert.throws(() => sanitizeProfile({ website: "javascript:alert(1)" }), /website/i);
});
test("sanitizeProfile ignores unknown keys and empty object", () => {
  assert.deepEqual(sanitizeProfile({ foo: "x" } as any), {});
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (append to `backend/src/domain/artist-content.ts`)

```typescript
import { query } from "../lib/dsql.ts";
import { HttpError } from "../lib/http.ts"; // match how HttpError is exported in http.ts

const MAX = { bio: 600, location: 120, website: 200, genre: 40 };

export function sanitizeProfile(
  input: Record<string, unknown>,
): { bio?: string; location?: string; website?: string; genre?: string } {
  const out: Record<string, string> = {};
  for (const k of ["bio", "location", "website", "genre"] as const) {
    const v = input[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (s.length > MAX[k]) throw new HttpError(400, `${k} too long`);
    if (k === "website" && !/^https?:\/\//i.test(s)) throw new HttpError(400, "website must be http(s)");
    out[k] = s;
  }
  return out;
}

export async function artistIdForAccount(accountId: string): Promise<string | null> {
  const r = await query<{ id: string }>(`SELECT id FROM artists WHERE account_id = $1 LIMIT 1`, [accountId]);
  return r.rows[0]?.id ?? null;
}
export async function ownsTrack(artistId: string, trackId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM tracks WHERE id = $1 AND artist_id = $2 LIMIT 1`, [trackId, artistId]);
  return r.rows.length > 0;
}
export async function setTrackCover(artistId: string, trackId: string, key: string): Promise<boolean> {
  const r = await query(
    `UPDATE tracks SET cover_image_key = $1 WHERE id = $2 AND artist_id = $3`,
    [key, trackId, artistId],
  );
  return (r.rowCount ?? 0) > 0;
}
export async function setArtistAvatar(artistId: string, key: string): Promise<void> {
  await query(`UPDATE artists SET avatar_key = $1 WHERE id = $2`, [key, artistId]);
}
export async function updateArtistProfile(
  artistId: string, fields: { bio?: string; location?: string; website?: string; genre?: string },
): Promise<void> {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  await query(`UPDATE artists SET ${sets} WHERE id = $${cols.length + 1}`, [...cols.map((c) => (fields as any)[c]), artistId]);
}
```

- [ ] **Step 4: Run → PASS.** (DB helpers are exercised manually post-deploy; only pure logic is unit-tested, matching repo convention.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/artist-content.ts backend/src/domain/artist-content.test.ts
git commit -m "feat(api): artist ownership checks + profile/cover/avatar DB writes"
```

---

### Task 9: Upload + profile handlers + routes

**Files:**
- Create: `backend/src/handlers/artist-content.ts`
- Modify: `backend/src/router.ts`
- Modify: `backend/src/x402.test.ts` (add route-match assertions)

**Interfaces:**
- Consumes: everything from 7/8; `requireSession` → `{ sub }`; `getSignedUrl`/presign.
- Produces handlers: `avatarPresign, avatarCommit, coverPresign, coverCommit, profileUpdate`.

- [ ] **Step 1: Add route-match tests** (`backend/src/x402.test.ts`, extend the existing "router matches" test)

```typescript
test("router matches artist content routes", () => {
  assert.ok(match("POST", "/artist/avatar/presign"));
  assert.ok(match("POST", "/artist/avatar/commit"));
  assert.ok(match("POST", "/artist/cover/presign"));
  assert.ok(match("POST", "/artist/cover/commit"));
  assert.ok(match("POST", "/artist/profile"));
});
```

- [ ] **Step 2: Run → FAIL** (routes not registered).

- [ ] **Step 3: Implement handlers** (`backend/src/handlers/artist-content.ts`)

```typescript
import { type Handler, ok, error, requireSession, NO_STORE } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import {
  extForContentType, buildImageKey, presignImagePut, imagesConfigured,
  artistIdForAccount, ownsTrack, setTrackCover, setArtistAvatar, updateArtistProfile, sanitizeProfile,
} from "../domain/artist-content.ts";

function rand(): string { return Math.random().toString(36).slice(2, 10); }

async function requireArtist(accountId: string): Promise<string> {
  const id = await artistIdForAccount(accountId);
  if (!id) throw new (await import("../lib/http.ts")).HttpError(403, "not an artist");
  return id;
}

export const avatarPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !imagesConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const ct = String((req.body as any)?.contentType ?? "");
  const ext = extForContentType(ct);
  if (!ext) return error(400, "unsupported image type");
  const key = buildImageKey("artist-avatars", artistId, ext, rand());
  const uploadUrl = await presignImagePut(key, ct);
  return ok({ uploadUrl, key }, NO_STORE);
};

export const avatarCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const key = String((req.body as any)?.key ?? "");
  if (!key.startsWith(`artist-avatars/${artistId}-`)) return error(403, "bad key");
  await setArtistAvatar(artistId, key);
  return ok({ ok: true, avatarKey: key }, NO_STORE);
};

export const coverPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !imagesConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!(await ownsTrack(artistId, trackId))) return error(403, "not your track");
  const ext = extForContentType(String(b.contentType ?? ""));
  if (!ext) return error(400, "unsupported image type");
  const key = buildImageKey("track-covers", trackId, ext, rand());
  const uploadUrl = await presignImagePut(key, String(b.contentType));
  return ok({ uploadUrl, key }, NO_STORE);
};

export const coverCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  const key = String(b.key ?? "");
  if (!key.startsWith(`track-covers/${trackId}-`)) return error(403, "bad key");
  const okUpd = await setTrackCover(artistId, trackId, key);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, coverImageKey: key }, NO_STORE);
};

export const profileUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const fields = sanitizeProfile((req.body ?? {}) as Record<string, unknown>);
  await updateArtistProfile(artistId, fields);
  return ok({ ok: true, ...fields }, NO_STORE);
};
```
(If `HttpError` is exported from `../lib/http.ts`, import it normally at the top instead of the inline `await import`. Match the file's actual export.)

- [ ] **Step 4: Register routes** (`backend/src/router.ts`)

```typescript
  compile("POST", "/artist/avatar/presign", artistContent.avatarPresign),
  compile("POST", "/artist/avatar/commit", artistContent.avatarCommit),
  compile("POST", "/artist/cover/presign", artistContent.coverPresign),
  compile("POST", "/artist/cover/commit", artistContent.coverCommit),
  compile("POST", "/artist/profile", artistContent.profileUpdate),
```
with `import * as artistContent from "./handlers/artist-content.ts";` (match the file's import style for handlers).

- [ ] **Step 5: Run full suite → PASS** (`cd backend && npm test`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/handlers/artist-content.ts backend/src/router.ts backend/src/x402.test.ts
git commit -m "feat(api): artist avatar/cover upload + profile update endpoints"
```

---

### Task 10: Images bucket + CloudFront (infra code only)

**Files:**
- Modify: `infra/lib/tollroad-stack.ts`

**Interfaces:**
- Produces env on the Lambda: `TOLLROAD_IMAGES_BUCKET`; CfnOutput `ImagesCdnDomain`.

- [ ] **Step 1: Add the bucket + distribution** — after the audio bucket/distribution block, add a public images bucket (no KMS, no signing) fronted by CloudFront with OAC, and grant the API Lambda PutObject:

```typescript
    // --- Public images bucket (cover art + avatars). Not sensitive: no KMS, no
    // signed URLs. CloudFront (OAC) serves it publicly; the API presigns PUTs. ---
    const imagesBucket = new s3.Bucket(this, "TollroadImagesBucket", {
      bucketName: `tollroad-images-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // public read is via CloudFront OAC, not the bucket
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [{
        allowedHeaders: ["*"],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedOrigins: ["http://localhost:3000", "https://www.tollroadmusic.xyz"],
        exposedHeaders: ["ETag"],
        maxAge: 3600,
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const imagesDistribution = new cloudfront.Distribution(this, "TollroadImagesCdn", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imagesBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // No trustedKeyGroups: images are public.
      },
      comment: "TollRoad images (cover art + avatars, public via OAC)",
    });
```

- [ ] **Step 2: Inject env + grant + output** — add to `apiEnv` (after `TOLLROAD_CDN_DOMAIN`):

```typescript
      TOLLROAD_IMAGES_BUCKET: imagesBucket.bucketName,
```
After `apiFn` is created, grant write:

```typescript
    imagesBucket.grantPut(apiFn);
```
And add an output near the other `CfnOutput`s:

```typescript
    new cdk.CfnOutput(this, "ImagesCdnDomain", {
      value: imagesDistribution.distributionDomainName,
      description: "CloudFront domain for images (set frontend NEXT_PUBLIC_IMAGES_BASE = https://<this>)",
    });
    new cdk.CfnOutput(this, "ImagesBucketName", { value: imagesBucket.bucketName });
```

- [ ] **Step 3: Typecheck / synth (NO deploy)**

Run: `cd infra && npm run build && npx cdk synth >/dev/null`
Expected: builds and synthesizes without error. (Do NOT deploy in this task.)

- [ ] **Step 4: Commit**

```bash
git add infra/lib/tollroad-stack.ts
git commit -m "feat(infra): public images bucket + CloudFront for cover art/avatars"
```

---

### Task 11: The one guarded deploy + verification (OPS — human-gated)

**Files:** none (deployment).

> This is the only risky step. It MUST use the guarded deploy and be verified. Confirm `backend/.env` has all required secrets first.

- [ ] **Step 1: Pre-flight** — `cd infra && npm run deploy:check` → reports all required secrets present (no missing). If it errors, STOP and restore `backend/.env` first.

- [ ] **Step 2: Deploy** — `cd infra && npm run deploy`. Watch for the new `ImagesCdnDomain` / `ImagesBucketName` outputs. Record the images CDN domain.

- [ ] **Step 3: Verify auth + streaming did NOT drop secrets:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.tollroadmusic.xyz/api/v1/auth/otp/verify -H 'content-type: application/json' -d '{}'
# expect 400/401 (NOT 503 = secret dropped)
curl -s -o /dev/null -w "%{http_code}\n" https://www.tollroadmusic.xyz/api/v1/catalog   # expect 200
```
If either is 503, restore secrets and re-run `npm run deploy` (see the secret-drift runbook). Do NOT proceed until green.

- [ ] **Step 4: Set frontend env** — set `NEXT_PUBLIC_IMAGES_BASE=https://<ImagesCdnDomain>` in the frontend's Vercel project env (and `frontend/.env.local` for local dev). Redeploy the frontend (Vercel) so the browser bundle picks it up.

- [ ] **Step 5: Confirm `TOLLROAD_IMAGES_BUCKET` is live on the Lambda** (structural check, no secret dump):

```bash
aws lambda get-function-configuration --function-name tollroad-api --query "Environment.Variables.TOLLROAD_IMAGES_BUCKET" --output text   # expect tollroad-images-<acct>
```

- [ ] **Step 6: Commit** any `frontend/.env.example` note (Task 13) separately; no code commit here.

---

### Task 12: Dashboard upload + profile editor UI

**Files:**
- Modify: `frontend/lib/api/client.ts`
- Create: `frontend/components/artist/ProfileEditor.tsx`
- Modify: `frontend/app/(artist)/artist/page.tsx`

**Interfaces:**
- Consumes backend 9 endpoints; `NEXT_PUBLIC_IMAGES_BASE` (for preview via `resolveCoverSrc`).
- Produces client methods: `presignAvatar, commitAvatar, presignCover, commitCover, updateArtistProfile, uploadImage`.

- [ ] **Step 1: Add client methods** (`frontend/lib/api/client.ts`)

```typescript
export const presignAvatar = (contentType: string) =>
  req<{ uploadUrl: string; key: string }>("/artist/avatar/presign", body({ contentType }));
export const commitAvatar = (key: string) =>
  req<{ ok: true; avatarKey: string }>("/artist/avatar/commit", body({ key }));
export const presignCover = (trackId: string, contentType: string) =>
  req<{ uploadUrl: string; key: string }>("/artist/cover/presign", body({ trackId, contentType }));
export const commitCover = (trackId: string, key: string) =>
  req<{ ok: true; coverImageKey: string }>("/artist/cover/commit", body({ trackId, key }));
export const updateArtistProfile = (fields: Record<string, string>) =>
  req<{ ok: true }>("/artist/profile", body(fields));

// Presign -> PUT the bytes straight to S3 -> commit. Returns the stored key.
export async function uploadImage(
  file: File,
  presign: (ct: string) => Promise<{ uploadUrl: string; key: string }>,
  commit: (key: string) => Promise<unknown>,
): Promise<string> {
  const { uploadUrl, key } = await presign(file.type);
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  await commit(key);
  return key;
}
```

- [ ] **Step 2: Build `ProfileEditor`** (`frontend/components/artist/ProfileEditor.tsx`) — `"use client"`. Props: the current `summary.artist` + `summary.tracks`. Renders:
  - An avatar control: shows `<CoverImage coverKey={avatarKey}>`, a file input (`accept="image/png,image/jpeg,image/webp"`); on change → `uploadImage(file, presignAvatar, commitAvatar)`, update local preview state.
  - A profile form: `bio` (textarea), `location`, `website`, `genre` inputs; Save → `updateArtistProfile({...})`; show saved/err state.
  - A per-track cover list: for each track, `<CoverImage coverKey={t.coverImageKey}>` + a file input; on change → `uploadImage(file, (ct)=>presignCover(t.id, ct), (key)=>commitCover(t.id, key))`, update that row's preview.
  - Use existing `az-*`/form classes; keep it simple and legible. After any commit, optimistically update local state (no full reload needed) and surface errors inline.

- [ ] **Step 3: Mount it on the dashboard** (`frontend/app/(artist)/artist/page.tsx`) — when `summary` exists, render `<ProfileEditor artist={summary.artist} tracks={summary.tracks} />` (replacing/augmenting the read-only block from Task 5; the editor subsumes the display). The page stays a server component; `ProfileEditor` is the client island.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api/client.ts frontend/components/artist/ProfileEditor.tsx "frontend/app/(artist)/artist/page.tsx"
git commit -m "feat(web): artist dashboard profile editor + cover/avatar uploads"
```

---

### Task 13: Frontend env doc + end-to-end verification

**Files:**
- Modify: `frontend/.env.example`

- [ ] **Step 1: Document the env var** (`frontend/.env.example`) — add:

```
# Public CloudFront base for uploaded cover art / avatars (CDK output ImagesCdnDomain)
NEXT_PUBLIC_IMAGES_BASE=
```

- [ ] **Step 2: End-to-end manual verification** (after 11 deploy + frontend redeploy):
  - Sign in as an artist account; open the dashboard.
  - Edit bio/location/website/genre → Save → reload → persists.
  - Upload an avatar → it appears on the dashboard and on the public `/artists/[id]` page.
  - Upload a cover for one track → it appears on that track's card in `/browse` and on the artist page.
  - Confirm an unsigned/other-artist account cannot upload to a track it doesn't own (expect 403).
  - Confirm streaming + auth still healthy (re-run 11 Step 3 curls).

- [ ] **Step 3: Commit**

```bash
git add frontend/.env.example
git commit -m "docs(web): document NEXT_PUBLIC_IMAGES_BASE"
```

---

### Tier B checkpoint

- [ ] `cd backend && npm test` PASS; `cd frontend && npx tsc --noEmit` clean.
- [ ] Live: upload→render works end-to-end; ownership enforced; auth/streaming green.
- [ ] **Tier B mergeable to `main`** after human review. Freeze `main` before the demo dry-run.

---

## Notes for the implementer

- Match each file's **existing import/style** when the snippet says "match" — exact names of `HttpError`, `dsqlConfigured`, and handler import aggregation may differ slightly from the snippets; the recon confirmed the shapes but transcribe against the real file.
- DB-touching domain functions are verified manually (the repo has no DB integration harness); only pure logic is unit-tested — do not stand up a DSQL test rig this week.
- If `cd frontend && npx tsc --noEmit` reports pre-existing errors unrelated to these changes, note them but don't fix unrelated code.
