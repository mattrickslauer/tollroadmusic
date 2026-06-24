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
