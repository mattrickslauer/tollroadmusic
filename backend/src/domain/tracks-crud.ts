// Artist-managed song CRUD — pure validation + audio-key helpers here; DSQL ops
// and S3 presign added in the next task.

export function isValidTitle(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= 200;
}

// 1 second … 10 hours. Guards against absurd/negative durations in the meter.
export function isValidDuration(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 36000;
}

const AUDIO_CT_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
};
export function extForAudioContentType(ct: string): string | null {
  return AUDIO_CT_EXT[ct] ?? null;
}

export function buildAudioKey(trackId: string, ext: string, rand: string): string {
  return `audio/${trackId}-${rand}.${ext}`;
}

import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query } from "../lib/dsql.ts";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
// Audio uploads go to the bucket fronted by the streaming CloudFront distribution.
// Falls back to the images bucket for a single-bucket local demo.
const AUDIO_BUCKET = process.env.TOLLROAD_AUDIO_BUCKET ?? process.env.TOLLROAD_IMAGES_BUCKET;

export function audioConfigured(): boolean {
  return Boolean(AUDIO_BUCKET);
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}
export async function presignAudioPut(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: AUDIO_BUCKET!, Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: 600 });
}

export async function createTrack(input: {
  artistId: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteMillicents: number;
}): Promise<{ id: string }> {
  const id = randomUUID();
  // audio_key is NOT NULL in the schema; insert a '' placeholder until the upload
  // is committed. The catalog hides tracks with an empty audio_key.
  await query(
    `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key)
       VALUES ($1, $2, $3, $4, $5, '')`,
    [id, input.artistId, input.title.trim(), input.durationSeconds, input.pricePerMinuteMillicents],
  );
  return { id };
}

export async function setTrackAudio(artistId: string, trackId: string, key: string): Promise<boolean> {
  const r = await query(
    `UPDATE tracks SET audio_key = $3 WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId, key],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function updateTrack(
  artistId: string,
  trackId: string,
  fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number },
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.title !== undefined) { sets.push(`title = $${sets.length + 1}`); vals.push(fields.title.trim()); }
  if (fields.durationSeconds !== undefined) { sets.push(`duration_seconds = $${sets.length + 1}`); vals.push(fields.durationSeconds); }
  if (fields.pricePerMinuteMillicents !== undefined) { sets.push(`price_per_minute_millicents = $${sets.length + 1}`); vals.push(fields.pricePerMinuteMillicents); }
  if (!sets.length) return false;
  vals.push(trackId, artistId);
  const r = await query(
    `UPDATE tracks SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND artist_id = $${vals.length}`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function softDeleteTrack(artistId: string, trackId: string): Promise<boolean> {
  const r = await query(
    `UPDATE tracks SET is_active = false WHERE id = $2 AND artist_id = $1`,
    [artistId, trackId],
  );
  return (r.rowCount ?? 0) > 0;
}
