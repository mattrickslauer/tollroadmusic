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

import { query } from "../lib/dsql.ts";
import { HttpError } from "../lib/http.ts";

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
export async function setTrackRate(
  artistId: string, trackId: string, rateMillicents: number,
): Promise<boolean> {
  const res = await query(
    `UPDATE tracks SET price_per_minute_millicents = $3
       WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId, rateMillicents],
  );
  return Boolean(res.rowCount);
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
