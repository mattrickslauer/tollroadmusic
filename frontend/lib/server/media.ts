// Server-only: audio at rest. Tracks are stored encrypted (AES-256-GCM) outside
// the public web root, and only the /api/stream route — after a play has been
// billed — ever decrypts them. The byte layout of a .enc file is:
//
//     iv (12 bytes) │ auth tag (16 bytes) │ ciphertext …
//
// When TOLLROAD_MEDIA_KEY is unset, or no .enc file exists for a track, we fall
// back to the plaintext file in /public so the demo runs without a key — the
// billing gate in the route still applies, so playback is never free.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDecipheriv } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

function mediaKey(): Buffer | null {
  const raw = process.env.TOLLROAD_MEDIA_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOLLROAD_MEDIA_KEY must be 32 bytes (base64-encoded)");
  }
  return key;
}

export function mediaEncryptionConfigured(): boolean {
  return Boolean(process.env.TOLLROAD_MEDIA_KEY);
}

/** Normalise an audio_key ("/audio/demo/x.mp3") to a repo-relative path with no
 *  leading slash or traversal. Returns null if it escapes the media roots. */
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

/** Decrypt a .enc payload (iv | tag | ciphertext) with AES-256-GCM. */
function decrypt(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Load and (if encrypted) decrypt a track's audio. Tries the encrypted file
 * under /media first; falls back to the plaintext file under /public. Throws if
 * neither exists.
 */
export async function loadAudio(audioKey: string): Promise<AudioBytes> {
  const rel = safeRel(audioKey);
  if (!rel) throw new Error("invalid audio key");
  const contentType = rel.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";

  const key = mediaKey();
  if (key) {
    const encPath = path.join(process.cwd(), "media", `${rel}.enc`);
    try {
      const payload = await readFile(encPath);
      return { data: decrypt(payload, key), contentType, encrypted: true };
    } catch (err) {
      // ENOENT → fall through to plaintext; anything else is a real failure.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }

  const plainPath = path.join(process.cwd(), "public", rel);
  const data = await readFile(plainPath);
  return { data, contentType, encrypted: false };
}
