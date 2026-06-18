// Audio at rest — the dev/local-proxy fallback for streaming. In production the
// stream handler issues a CloudFront signed URL and the bytes never touch the
// API; this module only runs when no CDN is configured (local dev).
//
// Encrypted layout of a .enc file: iv(12) | tag(16) | ciphertext. Ported from
// the front-end's lib/server/media.ts, with a configurable media root so it
// works outside Next's cwd.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDecipheriv } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

// Where plaintext / .enc audio lives for the proxy fallback. Defaults to the
// front-end's public dir so local dev plays the seeded demo tracks.
const MEDIA_ROOT =
  process.env.TOLLROAD_MEDIA_ROOT ||
  path.resolve(process.cwd(), "..", "frontend", "public");

function mediaKey(): Buffer | null {
  const raw = process.env.TOLLROAD_MEDIA_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOLLROAD_MEDIA_KEY must be 32 bytes (base64-encoded)");
  return key;
}

function safeRel(audioKey: string): string | null {
  const rel = audioKey.replace(/^\/+/, "");
  const normalized = path.posix.normalize(rel);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  return normalized;
}

export interface AudioBytes {
  data: Buffer;
  contentType: string;
  encrypted: boolean;
}

function decrypt(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function loadAudio(audioKey: string): Promise<AudioBytes> {
  const rel = safeRel(audioKey);
  if (!rel) throw new Error("invalid audio key");
  const contentType = rel.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";

  const key = mediaKey();
  if (key) {
    const encPath = path.join(MEDIA_ROOT, "..", "media", `${rel}.enc`);
    try {
      const payload = await readFile(encPath);
      return { data: decrypt(payload, key), contentType, encrypted: true };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }

  const plainPath = path.join(MEDIA_ROOT, rel);
  const data = await readFile(plainPath);
  return { data, contentType, encrypted: false };
}
