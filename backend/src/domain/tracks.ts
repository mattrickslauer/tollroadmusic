// Single-track lookups for the billing + streaming handlers. Ported from the
// front-end's lib/server/tracks.ts.
import { query } from "../lib/dsql.ts";

export interface TrackBilling {
  id: string;
  artistId: string;
  pricePerMinuteCents: number;
  audioKey: string;
}

export async function getTrackBilling(trackId: string): Promise<TrackBilling | null> {
  const res = await query<{
    id: string;
    artist_id: string;
    price_per_minute_cents: number;
    audio_key: string;
  }>(
    `SELECT id, artist_id, price_per_minute_cents, audio_key
       FROM tracks WHERE id = $1 LIMIT 1`,
    [trackId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    artistId: r.artist_id,
    pricePerMinuteCents: Number(r.price_per_minute_cents),
    audioKey: r.audio_key,
  };
}
