// Encrypt the demo audio at rest. Reads every .mp3 under frontend/public/audio
// and writes an AES-256-GCM .enc copy to frontend/media/audio (mirroring the
// path), which is what /api/stream decrypts. The plaintext files can then be
// deleted from /public so the only way to hear a track is a billed stream.
//
//   TOLLROAD_MEDIA_KEY=<base64 32 bytes> node infra/scripts/encrypt-media.mjs
//
// Generate a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// File layout written:  iv (12 bytes) | auth tag (16 bytes) | ciphertext
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, randomBytes } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "../../frontend/public");
const MEDIA_DIR = path.resolve(here, "../../frontend/media");
const AUDIO_SUBDIR = "audio";

const raw = process.env.TOLLROAD_MEDIA_KEY;
if (!raw) {
  console.error("Set TOLLROAD_MEDIA_KEY (base64 of 32 random bytes).");
  process.exit(1);
}
const key = Buffer.from(raw, "base64");
if (key.length !== 32) {
  console.error(`TOLLROAD_MEDIA_KEY must decode to 32 bytes (got ${key.length}).`);
  process.exit(1);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.endsWith(".mp3")) yield full;
  }
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

let count = 0;
for await (const src of walk(path.join(PUBLIC_DIR, AUDIO_SUBDIR))) {
  const rel = path.relative(PUBLIC_DIR, src);
  const dest = path.join(MEDIA_DIR, `${rel}.enc`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, encrypt(await readFile(src)));
  console.log("encrypted:", rel);
  count++;
}
console.log(`Done — ${count} file(s) encrypted to ${path.relative(process.cwd(), MEDIA_DIR)}.`);
console.log("You can now delete the plaintext .mp3 files from frontend/public/audio.");
