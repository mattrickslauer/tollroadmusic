// Catalog read model — the artists + tracks that power /browse and
// /api/catalog. One place so the page (server component) and the JSON API
// return identical shapes. Reads from DSQL via the same per-request client
// the sign-up route uses.

import { withDsql } from "@/lib/dsql";

export type CatalogTrack = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  genre: string | null;
  durationSeconds: number;
  pricePerMinuteCents: number;
  coverImageKey: string | null;
};

export type CatalogArtist = {
  id: string;
  name: string;
  genre: string | null;
  location: string | null;
  bio: string | null;
  avatarKey: string | null;
  payoutsEnabled: boolean;
  trackCount: number;
  minutes: number;
  earningsCents: number;
};

export type Catalog = {
  artists: CatalogArtist[];
  tracks: CatalogTrack[];
  stats: { artists: number; tracks: number; minutes: number; earningsCents: number };
};

const ARTISTS_SQL = `
  SELECT id, name, genre, location, bio, avatar_key,
         COALESCE(payouts_enabled, false) AS payouts_enabled
  FROM artists
  ORDER BY name`;

const TRACKS_SQL = `
  SELECT t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
         t.duration_seconds, t.price_per_minute_cents, t.cover_image_key
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  ORDER BY a.name, t.title`;

// Dashboard BI lives in the precomputed summary — never scan the ledger.
const EARNINGS_SQL = `
  SELECT artist_id,
         COALESCE(SUM(minutes), 0)      AS minutes,
         COALESCE(SUM(amount_cents), 0) AS earnings_cents
  FROM artist_daily_summary
  GROUP BY artist_id`;

export async function getCatalog(): Promise<Catalog> {
  return withDsql(async (db) => {
    // A single pg Client runs one query at a time; issuing these concurrently
    // (Promise.all) trips pg's "client is already executing a query" warning
    // and breaks under pg@9. Run them sequentially on the one connection.
    const artistsR = await db.query(ARTISTS_SQL);
    const tracksR = await db.query(TRACKS_SQL);
    const earnR = await db.query(EARNINGS_SQL);

    const earnings = new Map<string, { minutes: number; earningsCents: number }>();
    for (const r of earnR.rows) {
      earnings.set(r.artist_id, { minutes: Number(r.minutes), earningsCents: Number(r.earnings_cents) });
    }
    const trackCounts = new Map<string, number>();
    for (const r of tracksR.rows) {
      trackCounts.set(r.artist_id, (trackCounts.get(r.artist_id) || 0) + 1);
    }

    const artists: CatalogArtist[] = artistsR.rows.map((r) => {
      const e = earnings.get(r.id);
      return {
        id: r.id,
        name: r.name,
        genre: r.genre,
        location: r.location,
        bio: r.bio,
        avatarKey: r.avatar_key,
        payoutsEnabled: r.payouts_enabled,
        trackCount: trackCounts.get(r.id) || 0,
        minutes: e?.minutes ?? 0,
        earningsCents: e?.earningsCents ?? 0,
      };
    });

    const tracks: CatalogTrack[] = tracksR.rows.map((r) => ({
      id: r.id,
      title: r.title,
      artistId: r.artist_id,
      artistName: r.artist_name,
      genre: r.genre,
      durationSeconds: r.duration_seconds,
      pricePerMinuteCents: r.price_per_minute_cents,
      coverImageKey: r.cover_image_key,
    }));

    const stats = {
      artists: artists.length,
      tracks: tracks.length,
      minutes: [...earnings.values()].reduce((s, e) => s + e.minutes, 0),
      earningsCents: [...earnings.values()].reduce((s, e) => s + e.earningsCents, 0),
    };

    return { artists, tracks, stats };
  });
}
