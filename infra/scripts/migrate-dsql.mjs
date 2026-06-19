// Apply the TollRoad DSQL schema. Run once after the cluster is up:
//   TOLLROAD_DSQL_ENDPOINT=<endpoint> node scripts/migrate-dsql.mjs
//
// Auth is an IAM token used as the password (standard `pg` works). The DDL is
// the canonical copy of docs/data-model.md. DSQL caveats baked in: no FKs (app
// enforces), no triggers, secondary indexes via CREATE INDEX ASYNC, append-only
// ledger keyed by a UNIQUE idempotency key, precomputed summary table for BI.

import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
if (!ENDPOINT) {
  console.error("Set TOLLROAD_DSQL_ENDPOINT (from the CDK DsqlEndpoint output)");
  process.exit(1);
}

// One statement per array entry — DSQL allows a single DDL statement per
// transaction and won't mix DDL with DML.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS artists (
     id          UUID PRIMARY KEY,
     name        TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Artist sign-up captures more than the catalog needs — one ADD COLUMN per
  // statement (DSQL allows a single DDL op per transaction). Most are nullable
  // so the form stays SuperEasy: only name + email are required (app layer).
  //
  // Payouts run on Stripe Connect (Express): we store the connected-account id
  // (acct_…) and whether Stripe has enabled payouts. Bank/identity details live
  // in Stripe, never here.
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS email             TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS genre             TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio               TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS location          TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS website           TEXT`,
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`,
  // DSQL rejects ALTER ADD COLUMN with a constraint/default, so payouts_enabled
  // is nullable here. The app always inserts an explicit false and the webhook
  // sets true/false, so NULL never occurs in practice; treat NULL as false.
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS payouts_enabled   BOOLEAN`,
  `CREATE INDEX ASYNC IF NOT EXISTS artists_by_email ON artists (email)`,
  `CREATE INDEX ASYNC IF NOT EXISTS artists_by_stripe ON artists (stripe_account_id)`,
  `CREATE TABLE IF NOT EXISTS tracks (
     id                     UUID PRIMARY KEY,
     artist_id              UUID NOT NULL,
     title                  TEXT NOT NULL,
     duration_seconds       INTEGER NOT NULL,
     price_per_minute_cents INTEGER NOT NULL DEFAULT 1,
     audio_key              TEXT NOT NULL,
     created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Cover art lives next to the audio (a CDN/public key, same convention as
  // audio_key). Nullable so the upload flow stays simple; the catalog falls
  // back to a generated placeholder when absent.
  `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_key TEXT`,
  // Artist avatar — same storage convention as track covers.
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_key TEXT`,
  `CREATE INDEX ASYNC IF NOT EXISTS tracks_by_artist ON tracks (artist_id)`,
  // accounts = the unified AUTH identity (the canonical user id used across the
  // app and as royalty_ledger.user_id). An anonymous device is a row with
  // claimed_at = null; email-OTP sign-in upgrades it in place so the id never
  // changes. user_id stays the primary key (server code aliases it to `id`).
  `CREATE TABLE IF NOT EXISTS accounts (
     user_id     UUID PRIMARY KEY,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Auth columns — one ADD per statement (DSQL allows a single DDL op per txn);
  // all nullable because DSQL rejects ADD COLUMN with a constraint/default.
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email         TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS handle        TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_name  TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS auth_method   TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS claimed_at    TIMESTAMPTZ`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
  // Referral attribution — the account whose share link brought this listener in
  // (resolved from ?r=<handle> on a shared playlist at sign-up). Nullable; set
  // once, on the claim that creates the account. No wallet credit yet.
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS referred_by   UUID`,
  `CREATE INDEX ASYNC IF NOT EXISTS accounts_by_handle ON accounts (handle)`,
  `CREATE INDEX ASYNC IF NOT EXISTS accounts_by_email ON accounts (email)`,
  // An account can hold BOTH profiles at once. Artist profile = an artists row
  // linked back to its account (demo-seeded artists leave account_id null).
  `ALTER TABLE artists ADD COLUMN IF NOT EXISTS account_id UUID`,
  `CREATE INDEX ASYNC IF NOT EXISTS artists_by_account ON artists (account_id)`,
  // Listener profile = a prepaid balance the meter draws against. Separate row
  // so an account can be a listener, an artist, or both.
  `CREATE TABLE IF NOT EXISTS listener_profiles (
     account_id    UUID PRIMARY KEY,
     balance_cents BIGINT NOT NULL DEFAULT 0,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // One-time onboarding gift: stamped when the listener claims their free
  // welcome balance ($3 = 300 minutes at 1¢/min). NULL = unclaimed; its presence
  // makes the grant idempotent (claim is a no-op once set). Nullable because DSQL
  // rejects ADD COLUMN with a default.
  `ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS onboarding_gift_claimed_at TIMESTAMPTZ`,
  // Email OTP challenges (replaces sonar's DynamoDB items — we keep everything
  // in DSQL). Only a salted HASH of the code is stored; expiry + attempt cap are
  // enforced in SQL. Rows are burned on success and lazily on expiry.
  `CREATE TABLE IF NOT EXISTS auth_otp (
     email         TEXT PRIMARY KEY,
     code_hash     TEXT NOT NULL,
     attempts_left INTEGER NOT NULL,
     sent_at       BIGINT NOT NULL,
     send_count    INTEGER NOT NULL,
     expires_at    BIGINT NOT NULL
   )`,
  // Append-only royalty ledger — one immutable credit row per metered minute.
  `CREATE TABLE IF NOT EXISTS royalty_ledger (
     idempotency_key TEXT PRIMARY KEY,
     user_id         UUID NOT NULL,
     track_id        UUID NOT NULL,
     artist_id       UUID NOT NULL,
     minute_epoch    BIGINT NOT NULL,
     amount_cents    INTEGER NOT NULL,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS ledger_by_artist_minute ON royalty_ledger (artist_id, minute_epoch)`,
  // The listener's own streaming history reads the ledger by user_id — the rows
  // a listener paid for ARE their play history (one per metered minute).
  `CREATE INDEX ASYNC IF NOT EXISTS ledger_by_user_minute ON royalty_ledger (user_id, minute_epoch)`,
  // Precomputed BI — dashboard reads this, never scans the ledger.
  `CREATE TABLE IF NOT EXISTS artist_daily_summary (
     artist_id     UUID NOT NULL,
     day           DATE NOT NULL,
     minutes       BIGINT NOT NULL DEFAULT 0,
     amount_cents  BIGINT NOT NULL DEFAULT 0,
     PRIMARY KEY (artist_id, day)
   )`,
  // Wallet top-ups — one row per funded Stripe payment (ACH or card). The PK is
  // the Stripe PaymentIntent id (or a demo ref), so crediting a balance is
  // idempotent: a replayed webhook / confirm call is a no-op. amount_cents is
  // what we credit (the $10 face value); fee_cents records any card surcharge
  // the listener paid on top. method is 'ach' | 'card' | 'demo'.
  `CREATE TABLE IF NOT EXISTS wallet_topups (
     payment_ref   TEXT PRIMARY KEY,
     account_id    UUID NOT NULL,
     amount_cents  BIGINT NOT NULL,
     fee_cents     BIGINT NOT NULL DEFAULT 0,
     method        TEXT NOT NULL,
     status        TEXT NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS topups_by_account ON wallet_topups (account_id, created_at)`,

  // ---------------------------------------------------------------------
  // Listener library — likes, playlists, recently-played. New access patterns,
  // each a clean point/range query (no ledger scans). No FKs (DSQL); ownership
  // is enforced in the app by always scoping on account_id.
  // ---------------------------------------------------------------------
  // Liked tracks — one row per (listener, track); the heart state + "Liked
  // Songs" list. Read by account, newest first.
  `CREATE TABLE IF NOT EXISTS likes (
     account_id  UUID NOT NULL,
     track_id    UUID NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (account_id, track_id)
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS likes_by_account ON likes (account_id, created_at)`,
  // Playlists — a listener's named collections.
  `CREATE TABLE IF NOT EXISTS playlists (
     id             UUID PRIMARY KEY,
     account_id     UUID NOT NULL,
     name           TEXT NOT NULL,
     cover_track_id UUID,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS playlists_by_account ON playlists (account_id, created_at)`,
  // Playlist visibility — NULL/absent is treated as 'private' (DSQL ADD COLUMN
  // cannot carry a DEFAULT). 'public' playlists are readable unauthenticated.
  `ALTER TABLE playlists ADD COLUMN IF NOT EXISTS visibility TEXT`,
  // Playlist membership — ordered tracks within a playlist.
  `CREATE TABLE IF NOT EXISTS playlist_tracks (
     playlist_id UUID NOT NULL,
     track_id    UUID NOT NULL,
     position    INTEGER NOT NULL DEFAULT 0,
     added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (playlist_id, track_id)
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS playlist_tracks_by_playlist ON playlist_tracks (playlist_id, position)`,
  // Recently played — one row per (listener, track), upserted on play. Read by
  // account ORDER BY played_at DESC for the "recently played" rail.
  `CREATE TABLE IF NOT EXISTS recently_played (
     account_id  UUID NOT NULL,
     track_id    UUID NOT NULL,
     played_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (account_id, track_id)
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS recents_by_account ON recently_played (account_id, played_at)`,
];

const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
const token = await signer.getDbConnectAdminAuthToken();
const client = new Client({
  host: ENDPOINT,
  port: 5432,
  user: "admin",
  database: "postgres",
  password: token,
  ssl: { rejectUnauthorized: true },
});

await client.connect();
for (const sql of STATEMENTS) {
  const label = sql.split("\n")[0].slice(0, 60);
  await client.query(sql);
  console.log("ok:", label);
}
await client.end();
console.log("DSQL schema applied.");
