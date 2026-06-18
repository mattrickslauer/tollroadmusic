// Listener library — likes, playlists, and recently-played. NEW access patterns,
// each a clean DSQL point/range query (no ledger scans). App-layer ownership
// checks (DSQL has no foreign keys); see infra/scripts/migrate-dsql.mjs for DDL.
import { randomUUID } from "node:crypto";
import { query } from "../lib/dsql.ts";

export interface LibraryTrack {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  genre: string | null;
  durationSeconds: number;
  pricePerMinuteCents: number;
  coverImageKey: string | null;
  addedAt?: number;
}

// Shared projection so every library list returns the same track shape.
const TRACK_COLS = `
  t.id, t.title, t.artist_id, a.name AS artist_name, a.genre,
  t.duration_seconds, t.price_per_minute_cents, t.cover_image_key`;

function mapTrack(r: Record<string, unknown>): LibraryTrack {
  return {
    id: r.id as string,
    title: r.title as string,
    artistId: r.artist_id as string,
    artistName: r.artist_name as string,
    genre: (r.genre as string) ?? null,
    durationSeconds: Number(r.duration_seconds),
    pricePerMinuteCents: Number(r.price_per_minute_cents),
    coverImageKey: (r.cover_image_key as string) ?? null,
  };
}

// --- Likes -----------------------------------------------------------------

/** Toggle a like. Returns the resulting state. */
export async function toggleLike(accountId: string, trackId: string): Promise<{ liked: boolean }> {
  const del = await query(
    `DELETE FROM likes WHERE account_id = $1 AND track_id = $2`,
    [accountId, trackId],
  );
  if (del.rowCount) return { liked: false };
  await query(
    `INSERT INTO likes (account_id, track_id) VALUES ($1, $2)
       ON CONFLICT (account_id, track_id) DO NOTHING`,
    [accountId, trackId],
  );
  return { liked: true };
}

export async function setLike(accountId: string, trackId: string, liked: boolean): Promise<void> {
  if (liked) {
    await query(
      `INSERT INTO likes (account_id, track_id) VALUES ($1, $2)
         ON CONFLICT (account_id, track_id) DO NOTHING`,
      [accountId, trackId],
    );
  } else {
    await query(`DELETE FROM likes WHERE account_id = $1 AND track_id = $2`, [accountId, trackId]);
  }
}

export async function listLikedTracks(accountId: string): Promise<LibraryTrack[]> {
  const res = await query(
    `SELECT ${TRACK_COLS}, l.created_at
       FROM likes l
       JOIN tracks t  ON t.id = l.track_id
       JOIN artists a ON a.id = t.artist_id
      WHERE l.account_id = $1
      ORDER BY l.created_at DESC`,
    [accountId],
  );
  return res.rows.map(mapTrack);
}

/** Ids the account has liked — for hydrating heart state in lists. */
export async function likedTrackIds(accountId: string): Promise<string[]> {
  const res = await query<{ track_id: string }>(
    `SELECT track_id FROM likes WHERE account_id = $1`,
    [accountId],
  );
  return res.rows.map((r) => r.track_id);
}

// --- Playlists -------------------------------------------------------------

export interface PlaylistSummary {
  id: string;
  name: string;
  coverTrackId: string | null;
  trackCount: number;
  createdAt: string;
}

export async function listPlaylists(accountId: string): Promise<PlaylistSummary[]> {
  const res = await query<{
    id: string;
    name: string;
    cover_track_id: string | null;
    created_at: string;
    n: string;
  }>(
    `SELECT p.id, p.name, p.cover_track_id, p.created_at,
            (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS n
       FROM playlists p
      WHERE p.account_id = $1
      ORDER BY p.created_at DESC`,
    [accountId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    coverTrackId: r.cover_track_id,
    trackCount: Number(r.n),
    createdAt: r.created_at,
  }));
}

export async function createPlaylist(accountId: string, name: string): Promise<PlaylistSummary> {
  const id = randomUUID();
  const clean = name.trim().slice(0, 120) || "New playlist";
  const res = await query<{ created_at: string }>(
    `INSERT INTO playlists (id, account_id, name) VALUES ($1, $2, $3) RETURNING created_at`,
    [id, accountId, clean],
  );
  return { id, name: clean, coverTrackId: null, trackCount: 0, createdAt: res.rows[0]!.created_at };
}

export async function deletePlaylist(accountId: string, playlistId: string): Promise<boolean> {
  // Ownership enforced in the WHERE clause.
  const del = await query(`DELETE FROM playlists WHERE id = $1 AND account_id = $2`, [
    playlistId,
    accountId,
  ]);
  if (!del.rowCount) return false;
  await query(`DELETE FROM playlist_tracks WHERE playlist_id = $1`, [playlistId]).catch(() => {});
  return true;
}

export interface PlaylistDetail extends PlaylistSummary {
  tracks: LibraryTrack[];
}

export async function getPlaylist(accountId: string, playlistId: string): Promise<PlaylistDetail | null> {
  const head = await query<{ name: string; cover_track_id: string | null; created_at: string }>(
    `SELECT name, cover_track_id, created_at FROM playlists WHERE id = $1 AND account_id = $2`,
    [playlistId, accountId],
  );
  const h = head.rows[0];
  if (!h) return null;
  const tracksR = await query(
    `SELECT ${TRACK_COLS}, pt.position
       FROM playlist_tracks pt
       JOIN tracks t  ON t.id = pt.track_id
       JOIN artists a ON a.id = t.artist_id
      WHERE pt.playlist_id = $1
      ORDER BY pt.position ASC, pt.added_at ASC`,
    [playlistId],
  );
  return {
    id: playlistId,
    name: h.name,
    coverTrackId: h.cover_track_id,
    trackCount: tracksR.rowCount ?? 0,
    createdAt: h.created_at,
    tracks: tracksR.rows.map(mapTrack),
  };
}

export async function addToPlaylist(
  accountId: string,
  playlistId: string,
  trackId: string,
): Promise<boolean> {
  // Confirm ownership before mutating the join table.
  const owns = await query(`SELECT 1 FROM playlists WHERE id = $1 AND account_id = $2`, [
    playlistId,
    accountId,
  ]);
  if (!owns.rowCount) return false;
  const pos = await query<{ next: string }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM playlist_tracks WHERE playlist_id = $1`,
    [playlistId],
  );
  await query(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)
       ON CONFLICT (playlist_id, track_id) DO NOTHING`,
    [playlistId, trackId, Number(pos.rows[0]!.next)],
  );
  // First track becomes the cover if none set.
  await query(
    `UPDATE playlists SET cover_track_id = $2 WHERE id = $1 AND cover_track_id IS NULL`,
    [playlistId, trackId],
  );
  return true;
}

export async function removeFromPlaylist(
  accountId: string,
  playlistId: string,
  trackId: string,
): Promise<boolean> {
  const owns = await query(`SELECT 1 FROM playlists WHERE id = $1 AND account_id = $2`, [
    playlistId,
    accountId,
  ]);
  if (!owns.rowCount) return false;
  await query(`DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2`, [
    playlistId,
    trackId,
  ]);
  return true;
}

// --- Recently played -------------------------------------------------------

/** Upsert the last-played timestamp for a track. Called fire-and-forget when a
 *  play starts. One row per (account, track) — newest wins. */
export async function recordPlay(accountId: string, trackId: string): Promise<void> {
  await query(
    `INSERT INTO recently_played (account_id, track_id, played_at)
       VALUES ($1, $2, now())
     ON CONFLICT (account_id, track_id)
       DO UPDATE SET played_at = EXCLUDED.played_at`,
    [accountId, trackId],
  );
}

export async function recentTracks(accountId: string, limit = 12): Promise<LibraryTrack[]> {
  const res = await query(
    `SELECT ${TRACK_COLS}, rp.played_at
       FROM recently_played rp
       JOIN tracks t  ON t.id = rp.track_id
       JOIN artists a ON a.id = t.artist_id
      WHERE rp.account_id = $1
      ORDER BY rp.played_at DESC
      LIMIT $2`,
    [accountId, Math.min(Math.max(limit, 1), 50)],
  );
  return res.rows.map(mapTrack);
}
