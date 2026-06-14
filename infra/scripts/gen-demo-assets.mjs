// Generate the demo's local assets: an original instrumental audio pool (ffmpeg)
// and a deterministic SVG cover for every artist + track. Writes into
// frontend/public so Next.js serves them statically — same pattern as the
// existing /kanye-west demo track, no S3/CloudFront needed for the demo.
//
//   node scripts/gen-demo-assets.mjs            # audio (if missing) + covers
//   node scripts/gen-demo-assets.mjs --force    # re-render audio too
//
// The audio is synthesised from scratch (layered sine chords + tremolo), so it
// is 100% original — zero licensing concerns — and each family sounds distinct.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AUDIO_POOL, buildArtists, buildTracks, slug } from "./demo-data.mjs";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../../frontend/public");
const AUDIO_DIR = resolve(PUBLIC, "audio/demo");
const COVER_DIR = resolve(PUBLIC, "covers");
const FORCE = process.argv.includes("--force");
// 96 kbps keeps these mono-ish sine pads small; full-length loops × 12 would
// otherwise bloat the repo. Plenty of fidelity for ambient demo audio.
const BITRATE = "96k";

const exists = (p) => access(p).then(() => true).catch(() => false);

// ---------------------------------------------------------------------------
// Audio — layered sine "chord" + rhythmic tremolo, tuned per family.
// ---------------------------------------------------------------------------

function familyShape(family, key) {
  // chord partials as frequency multipliers (just intonation-ish)
  const base = { electronic: [1, 1.5, 2, 3], chill: [1, 1.25, 1.5], urban: [0.5, 1, 1.5], band: [1, 1.25, 1.5, 2] }[family] || [1, 1.5];
  const lowpass = { electronic: 3200, chill: 1600, urban: 2200, band: 2800 }[family] || 2400;
  return { freqs: base.map((m) => +(key * m).toFixed(2)), lowpass };
}

async function renderAudio(track) {
  const out = resolve(AUDIO_DIR, `${track.id}.mp3`);
  if (!FORCE && (await exists(out))) return { id: track.id, skipped: true };
  const { freqs, lowpass } = familyShape(track.family, track.key);
  const trem = (track.bpm / 60).toFixed(3); // pulse ~ beats per second
  const dur = track.seconds; // real length of this loop = the track metadata

  const inputs = [];
  freqs.forEach((f) => {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=${f}:duration=${dur}`);
  });
  const mix = `amix=inputs=${freqs.length}:normalize=1`;
  // loudnorm gives every loop a consistent, audible level regardless of how
  // many partials it mixes; tremolo adds a rhythmic pulse, lowpass tames the
  // harshness, fades top and tail it.
  const shape = `tremolo=f=${trem}:d=0.55,lowpass=f=${lowpass},loudnorm=I=-15:TP=-1.0:LRA=11,aformat=channel_layouts=stereo,afade=t=in:ss=0:d=0.8,afade=t=out:st=${dur - 1}:d=1`;
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", `${mix},${shape}[a]`,
    "-map", "[a]", "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", "44100",
    out,
  ];
  await exec("ffmpeg", args);
  return { id: track.id, skipped: false };
}

// ---------------------------------------------------------------------------
// Covers — deterministic gradient + geometric motif. Two flavours: artist
// (initials) and track (a little equaliser glyph).
// ---------------------------------------------------------------------------

function hues(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + ((h >> 8) % 80)) % 360;
  return [a, b];
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function initials(name) {
  const words = name.replace(/^The\s+/i, "").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "") + (words[1]?.[0] || "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function artistCover(name) {
  const [h1, h2] = hues(name);
  const id = "g" + Math.abs(h1 * 7 + h2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1} 65% 32%)"/><stop offset="1" stop-color="hsl(${h2} 70% 18%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
<circle cx="320" cy="86" r="150" fill="hsl(${h2} 80% 60%)" opacity="0.18"/>
<circle cx="70" cy="330" r="110" fill="hsl(${h1} 80% 70%)" opacity="0.14"/>
<text x="200" y="200" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#fff" fill-opacity="0.92" text-anchor="middle" dominant-baseline="central">${esc(initials(name))}</text>
</svg>`;
}

function trackCover(seed) {
  const [h1, h2] = hues(seed);
  const id = "g" + Math.abs(h1 * 13 + h2 + 1);
  let r = 0;
  for (const c of seed) r = (r * 131 + c.charCodeAt(0)) >>> 0;
  const bars = Array.from({ length: 13 }, (_, i) => {
    r = (r * 1103515245 + 12345) >>> 0;
    const hgt = 26 + (r % 120);
    const x = 60 + i * 22;
    return `<rect x="${x}" y="${290 - hgt}" width="12" height="${hgt}" rx="6" fill="#fff" fill-opacity="${(0.45 + (r % 50) / 100).toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
<stop offset="0" stop-color="hsl(${h1} 72% 26%)"/><stop offset="1" stop-color="hsl(${h2} 75% 14%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
<circle cx="330" cy="78" r="120" fill="hsl(${h1} 85% 62%)" opacity="0.16"/>
${bars}
</svg>`;
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(AUDIO_DIR, { recursive: true });
  await mkdir(COVER_DIR, { recursive: true });

  // ffmpeg present?
  try {
    await exec("ffmpeg", ["-version"]);
  } catch {
    console.error("ffmpeg not found — install it, or skip audio with metadata-only seeding.");
    process.exit(1);
  }

  console.log(`Audio pool → ${AUDIO_DIR}`);
  let made = 0, skip = 0;
  for (const t of AUDIO_POOL) {
    const r = await renderAudio(t);
    r.skipped ? skip++ : (made++, console.log(`  rendered ${t.id}.mp3  (${t.mood})`));
  }
  console.log(`  audio: ${made} rendered, ${skip} already present`);

  console.log(`Covers → ${COVER_DIR}`);
  const artists = buildArtists();
  let covers = 0;
  for (const a of artists) {
    await writeFile(resolve(COVER_DIR, `artist-${a.slug}.svg`), artistCover(a.name));
    covers++;
    for (const tk of buildTracks(a)) {
      const file = tk.cover_image_key.split("/").pop();
      await writeFile(resolve(COVER_DIR, file), trackCover(tk.title + tk.audio_key));
      covers++;
    }
  }
  console.log(`  covers: ${covers} SVGs written`);
  console.log("Assets ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
