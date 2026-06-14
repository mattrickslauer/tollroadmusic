// Seed the TollRoad demo catalog into Aurora DSQL.
//
//   # 1. assets (audio + covers) — writes into frontend/public
//   node scripts/gen-demo-assets.mjs
//   # 2. data — upsert artists, tracks, 30 days of earnings
//   TOLLROAD_DSQL_ENDPOINT=<endpoint> node scripts/seed-demo.mjs
//
// With no endpoint set (or --dry-run) it prints a summary and writes
// seed-preview.json instead of touching a database — handy for review.
//
// Everything is DETERMINISTIC and idempotent: ids come from demo-data.mjs and
// every write is ON CONFLICT DO UPDATE, so re-running refreshes rather than
// duplicates. Safe to run repeatedly. Use --reset to delete demo rows first.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildArtists, buildTracks, uuidFrom, rng } from "./demo-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
const DRY = process.argv.includes("--dry-run") || !ENDPOINT;
const RESET = process.argv.includes("--reset");

const ARTIST_COUNT = 55;
const ARTIST_SHARE = 0.7; // consumer pays price/min; artist keeps 70%
const HISTORY_DAYS = 30;
const BASE_DAILY_MINUTES = 520; // scaled by popularity/trend/noise

// A small pool of demo listeners the ledger rows are attributed to.
const LISTENERS = Array.from({ length: 8 }, (_, i) => uuidFrom(`listener:${i}`));

// ---------------------------------------------------------------------------
// Synthesise 30 days of plausible earnings for one artist.
// ---------------------------------------------------------------------------

function backfill(artist, tracks, todayMs) {
  const pop = Math.min(1, tracks.reduce((s, t) => s + t.popularity, 0) / tracks.length);
  const avgPrice = tracks.reduce((s, t) => s + t.price_per_minute_cents, 0) / tracks.length;
  const daily = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const ms = todayMs - (HISTORY_DAYS - 1 - i) * 86400_000;
    const d = new Date(ms);
    const day = d.toISOString().slice(0, 10);
    const r = rng(`day:${artist.id}:${day}`);
    const trend = 0.55 + 0.6 * (i / (HISTORY_DAYS - 1)); // gentle month-long growth
    const dow = d.getUTCDay();
    const weekend = dow === 5 || dow === 6 ? 1.25 : 1.0;
    const noise = 0.55 + r() * 0.9;
    const minutes = Math.max(0, Math.round(pop * trend * weekend * noise * BASE_DAILY_MINUTES));
    const amount_cents = Math.round(minutes * avgPrice * ARTIST_SHARE);
    daily.push({ artist_id: artist.id, day, minutes, amount_cents });
  }

  // A handful of raw ledger rows on the most recent day, so the append-only
  // ledger isn't empty and reconciles roughly with the summary. (The dashboard
  // reads the summary; the ledger is the audit trail.)
  const ledger = [];
  const recent = new Date(todayMs).toISOString().slice(0, 10);
  const baseEpoch = Math.floor(todayMs / 1000 / 60); // minute epoch for "now"
  const r = rng(`ledger:${artist.id}`);
  const hot = [...tracks].sort((a, b) => b.popularity - a.popularity).slice(0, 2);
  for (const t of hot) {
    const credit = Math.max(1, Math.round(t.price_per_minute_cents * ARTIST_SHARE));
    const minutes = 2 + Math.floor(r() * 6);
    for (let m = 0; m < minutes; m++) {
      const user = LISTENERS[Math.floor(r() * LISTENERS.length)];
      const minute = baseEpoch - m;
      ledger.push({
        idempotency_key: `${user}#${t.id}#${minute}`,
        user_id: user,
        track_id: t.id,
        artist_id: artist.id,
        minute_epoch: minute,
        amount_cents: credit,
        day: recent,
      });
    }
  }
  return { daily, ledger };
}

// ---------------------------------------------------------------------------
// Build the full dataset in memory.
// ---------------------------------------------------------------------------

function buildAll() {
  const todayMs = Date.parse(new Date().toISOString().slice(0, 10)); // midnight UTC today
  const artists = buildArtists(ARTIST_COUNT);
  const tracks = [];
  const daily = [];
  const ledger = [];
  for (const a of artists) {
    const ts = buildTracks(a);
    tracks.push(...ts);
    const bf = backfill(a, ts, todayMs);
    daily.push(...bf.daily);
    ledger.push(...bf.ledger);
  }
  return { artists, tracks, daily, ledger };
}

// ---------------------------------------------------------------------------
// DSQL writes — chunked, parameterised, ON CONFLICT upserts.
// ---------------------------------------------------------------------------

const CHUNK = 50; // rows per INSERT (DSQL caps rows/statement; stay well under)

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Build a parameterised multi-row INSERT. `cols` names the columns; `rows` is
// an array of value-arrays in the same order.
function multiInsert(table, cols, rows, conflict) {
  const ph = rows
    .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`)
    .join(",");
  const params = rows.flat();
  return {
    text: `INSERT INTO ${table} (${cols.join(",")}) VALUES ${ph} ${conflict}`,
    params,
  };
}

async function insertAll(db, table, cols, rows, conflict, label) {
  let done = 0;
  for (const batch of chunks(rows, CHUNK)) {
    const { text, params } = multiInsert(table, cols, batch, conflict);
    await db.query(text, params);
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  process.stdout.write(`\r  ${label}: ${rows.length} done            \n`);
}

async function connect() {
  // Imported lazily so --dry-run / previews work without infra deps installed.
  const { Client } = await import("pg");
  const { DsqlSigner } = await import("@aws-sdk/dsql-signer");
  const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
  const token = await signer.getDbConnectAdminAuthToken();
  const client = new Client({
    host: ENDPOINT, port: 5432, user: "admin", database: "postgres",
    password: token, ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

async function seed({ artists, tracks, daily, ledger }) {
  const db = await connect();
  try {
    if (RESET) {
      console.log("Resetting demo rows…");
      const ids = artists.map((a) => `'${a.id}'`).join(",");
      await db.query(`DELETE FROM royalty_ledger WHERE artist_id IN (${ids})`);
      await db.query(`DELETE FROM artist_daily_summary WHERE artist_id IN (${ids})`);
      await db.query(`DELETE FROM tracks WHERE artist_id IN (${ids})`);
      await db.query(`DELETE FROM artists WHERE id IN (${ids})`);
    }

    await insertAll(
      db, "accounts", ["user_id"],
      LISTENERS.map((u) => [u]),
      "ON CONFLICT (user_id) DO NOTHING", "listeners",
    );

    await insertAll(
      db, "artists",
      ["id", "name", "email", "genre", "location", "website", "bio", "avatar_key", "payouts_enabled"],
      artists.map((a) => [a.id, a.name, a.email, a.genre, a.location, a.website, a.bio, a.avatar_key, a.payouts_enabled]),
      `ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, email=EXCLUDED.email, genre=EXCLUDED.genre,
         location=EXCLUDED.location, website=EXCLUDED.website, bio=EXCLUDED.bio,
         avatar_key=EXCLUDED.avatar_key, payouts_enabled=EXCLUDED.payouts_enabled`,
      "artists",
    );

    await insertAll(
      db, "tracks",
      ["id", "artist_id", "title", "duration_seconds", "price_per_minute_cents", "audio_key", "cover_image_key"],
      tracks.map((t) => [t.id, t.artist_id, t.title, t.duration_seconds, t.price_per_minute_cents, t.audio_key, t.cover_image_key]),
      `ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, duration_seconds=EXCLUDED.duration_seconds,
         price_per_minute_cents=EXCLUDED.price_per_minute_cents,
         audio_key=EXCLUDED.audio_key, cover_image_key=EXCLUDED.cover_image_key`,
      "tracks",
    );

    await insertAll(
      db, "artist_daily_summary",
      ["artist_id", "day", "minutes", "amount_cents"],
      daily.map((d) => [d.artist_id, d.day, d.minutes, d.amount_cents]),
      `ON CONFLICT (artist_id, day) DO UPDATE SET
         minutes=EXCLUDED.minutes, amount_cents=EXCLUDED.amount_cents`,
      "daily summary",
    );

    await insertAll(
      db, "royalty_ledger",
      ["idempotency_key", "user_id", "track_id", "artist_id", "minute_epoch", "amount_cents"],
      ledger.map((l) => [l.idempotency_key, l.user_id, l.track_id, l.artist_id, l.minute_epoch, l.amount_cents]),
      "ON CONFLICT (idempotency_key) DO NOTHING", "ledger",
    );
  } finally {
    await db.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const data = buildAll();
  const { artists, tracks, daily, ledger } = data;
  const totalEarn = daily.reduce((s, d) => s + d.amount_cents, 0);
  console.log("TollRoad demo seed");
  console.log(`  artists:        ${artists.length}`);
  console.log(`  tracks:         ${tracks.length}`);
  console.log(`  daily rows:     ${daily.length}  (${HISTORY_DAYS} days × artists)`);
  console.log(`  ledger rows:    ${ledger.length}`);
  console.log(`  listeners:      ${LISTENERS.length}`);
  console.log(`  total credited: $${(totalEarn / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} over ${HISTORY_DAYS} days`);

  if (DRY) {
    const out = resolve(HERE, "seed-preview.json");
    await writeFile(out, JSON.stringify({ artists, tracks: tracks.slice(0, 20), sampleDaily: daily.slice(0, 30), sampleLedger: ledger.slice(0, 20) }, null, 2));
    console.log(`\nDRY RUN — no database written.${ENDPOINT ? " (--dry-run)" : " (TOLLROAD_DSQL_ENDPOINT not set)"}`);
    console.log(`Preview written to ${out}`);
    return;
  }

  console.log(`\nSeeding ${ENDPOINT} …`);
  await seed(data);
  console.log("\nDone. Demo catalog is live in DSQL.");
}

main().catch((e) => {
  console.error("\nseed failed:", e);
  process.exit(1);
});
