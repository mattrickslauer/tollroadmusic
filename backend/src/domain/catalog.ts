// Catalog read model — artists + tracks + stats. Ported from the front-end's
// lib/catalog.ts. Reads from DSQL; the dashboard BI comes from the precomputed
// artist_daily_summary (never scans the ledger).
import { withDsql } from "../lib/dsql.ts";

export type CatalogTrack = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  genre: string | null;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
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
  earningsMillicents: number;
};

export type Catalog = {
  artists: CatalogArtist[];
  tracks: CatalogTrack[];
  stats: { artists: number; tracks: number; minutes: number; earningsMillicents: number };
};

const ARTISTS_SQL = `
  SELECT id, name, genre, location, bio, avatar_key,
         COALESCE(payouts_enabled, false) AS payouts_enabled
  FROM artists
  ORDER BY name`;

const TRACKS_SQL = `
  SELECT t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
         t.duration_seconds, t.price_per_minute_millicents, t.cover_image_key
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  ORDER BY a.name, t.title`;

const EARNINGS_SQL = `
  SELECT artist_id,
         COALESCE(SUM(minutes), 0)      AS minutes,
         COALESCE(SUM(amount_millicents), 0) AS earnings_millicents
  FROM artist_daily_summary
  GROUP BY artist_id`;

export async function getCatalog(): Promise<Catalog> {
  return withDsql(async (db) => {
    // One pg Client runs one query at a time; run sequentially on the connection.
    const artistsR = await db.query(ARTISTS_SQL);
    const tracksR = await db.query(TRACKS_SQL);
    const earnR = await db.query(EARNINGS_SQL);

    const earnings = new Map<string, { minutes: number; earningsMillicents: number }>();
    for (const r of earnR.rows) {
      earnings.set(r.artist_id, { minutes: Number(r.minutes), earningsMillicents: Number(r.earnings_millicents) });
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
        earningsMillicents: e?.earningsMillicents ?? 0,
      };
    });

    const tracks: CatalogTrack[] = tracksR.rows.map((r) => ({
      id: r.id,
      title: r.title,
      artistId: r.artist_id,
      artistName: r.artist_name,
      genre: r.genre,
      durationSeconds: r.duration_seconds,
      pricePerMinuteMillicents: r.price_per_minute_millicents,
      coverImageKey: r.cover_image_key,
    }));

    const stats = {
      artists: artists.length,
      tracks: tracks.length,
      minutes: [...earnings.values()].reduce((s, e) => s + e.minutes, 0),
      earningsMillicents: [...earnings.values()].reduce((s, e) => s + e.earningsMillicents, 0),
    };

    return { artists, tracks, stats };
  });
}

/** The signed-in artist's royalty summary, for the artist dashboard. Reads the
 *  precomputed summary rows — never the raw ledger. */
export type ArtistTrack = {
  id: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
  coverImageKey: string | null;
};

export async function getArtistSummary(artistId: string): Promise<{
  artistId: string;
  minutes: number;
  earningsMillicents: number;
  trackCount: number;
  byDay: { day: string; minutes: number; amountMillicents: number }[];
  tracks: ArtistTrack[];
}> {
  return withDsql(async (db) => {
    const totalR = await db.query<{ minutes: string; amount_millicents: string }>(
      `SELECT COALESCE(SUM(minutes),0) AS minutes, COALESCE(SUM(amount_millicents),0) AS amount_millicents
         FROM artist_daily_summary WHERE artist_id = $1`,
      [artistId],
    );
    const tracksR = await db.query<{
      id: string;
      title: string;
      duration_seconds: number;
      price_per_minute_millicents: number;
      cover_image_key: string | null;
    }>(
      `SELECT id, title, duration_seconds, price_per_minute_millicents, cover_image_key
         FROM tracks WHERE artist_id = $1 ORDER BY title`,
      [artistId],
    );
    const byDayR = await db.query<{ day: string; minutes: string; amount_millicents: string }>(
      `SELECT day, minutes, amount_millicents FROM artist_daily_summary
        WHERE artist_id = $1 ORDER BY day DESC LIMIT 30`,
      [artistId],
    );
    const tracks: ArtistTrack[] = tracksR.rows.map((r) => ({
      id: r.id,
      title: r.title,
      durationSeconds: r.duration_seconds,
      pricePerMinuteMillicents: r.price_per_minute_millicents,
      coverImageKey: r.cover_image_key,
    }));
    return {
      artistId,
      minutes: Number(totalR.rows[0]?.minutes ?? 0),
      earningsMillicents: Number(totalR.rows[0]?.amount_millicents ?? 0),
      trackCount: tracks.length,
      byDay: byDayR.rows.map((r) => ({
        day: r.day,
        minutes: Number(r.minutes),
        amountMillicents: Number(r.amount_millicents),
      })),
      tracks,
    };
  });
}
