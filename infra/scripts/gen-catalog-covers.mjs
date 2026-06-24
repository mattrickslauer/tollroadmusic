// Regenerate the live catalog's cover/avatar SVGs in place (same filenames).
// Reads the deployed catalog so the exact cat-*.svg names are covered.
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COVER_DIR = resolve(HERE, "..", "..", "frontend", "public", "covers");
const CATALOG_URL = process.env.CATALOG_URL ?? "https://www.tollroadmusic.xyz/api/v1/catalog";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function hash(seed) { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
// Genre-anchored base hue so a genre reads as a palette family; track/title varies within it.
const GENRE_HUE = { Synthwave: 280, Jazz: 35, "Afro-Soul": 20, Downtempo: 200, Ambient: 190, "Lo-Fi": 150, Folk: 90, Electronic: 250, House: 320, Classical: 50 };
function palette(genre, seed) {
  const base = GENRE_HUE[genre] ?? (hash(genre ?? "x") % 360);
  const h = hash(seed);
  const h1 = (base + (h % 30)) % 360;
  const h2 = (base + 30 + ((h >> 8) % 60)) % 360;
  return [h1, h2];
}
function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "♪";
}
function artistCover(name, genre) {
  const [h1, h2] = palette(genre, name);
  const id = "g" + Math.abs(h1 * 7 + h2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1} 60% 30%)"/><stop offset="1" stop-color="hsl(${h2} 68% 16%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
<circle cx="320" cy="90" r="150" fill="hsl(${h2} 80% 62%)" opacity="0.16"/>
<circle cx="70" cy="330" r="120" fill="hsl(${h1} 80% 70%)" opacity="0.12"/>
<text x="200" y="208" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#fff" fill-opacity="0.92" text-anchor="middle" dominant-baseline="central">${esc(initials(name))}</text>
</svg>`;
}
function trackCover(seed, genre) {
  const [h1, h2] = palette(genre, seed);
  const id = "g" + Math.abs(h1 * 13 + h2 + 1);
  let r = hash(seed) || 1;
  const next = () => (r = (r * 1103515245 + 12345) >>> 0);
  // A varied motif: concentric arcs + a few accent dots, instead of the old uniform bars.
  const dots = Array.from({ length: 7 }, (_, i) => {
    next(); const cx = 50 + (r % 300); next(); const cy = 60 + (r % 280); next();
    const rad = 8 + (r % 26);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#fff" fill-opacity="${(0.12 + (r % 30) / 100).toFixed(2)}"/>`;
  }).join("");
  const rings = Array.from({ length: 3 }, (_, i) =>
    `<circle cx="200" cy="210" r="${60 + i * 46}" fill="none" stroke="#fff" stroke-opacity="${(0.22 - i * 0.05).toFixed(2)}" stroke-width="3"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
<stop offset="0" stop-color="hsl(${h1} 70% 24%)"/><stop offset="1" stop-color="hsl(${h2} 74% 13%)"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
${dots}${rings}
</svg>`;
}
const fileOf = (key) => key.split("/").pop();

const res = await fetch(CATALOG_URL);
if (!res.ok) { console.error("catalog fetch failed", res.status); process.exit(1); }
const { artists, tracks } = await res.json();
await mkdir(COVER_DIR, { recursive: true });
let n = 0;
for (const a of artists) {
  if (!a.avatarKey || !a.avatarKey.startsWith("/covers/")) continue;
  await writeFile(resolve(COVER_DIR, fileOf(a.avatarKey)), artistCover(a.name, a.genre)); n++;
}
for (const t of tracks) {
  if (!t.coverImageKey || !t.coverImageKey.startsWith("/covers/")) continue;
  await writeFile(resolve(COVER_DIR, fileOf(t.coverImageKey)), trackCover(t.title + t.id, t.genre)); n++;
}
console.log(`regenerated ${n} catalog SVGs in ${COVER_DIR}`);
