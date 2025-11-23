import fs from "fs"
import path from "path"
import Database from "better-sqlite3"

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true })
  }
}

function init() {
  const dataDir = path.resolve(process.cwd(), "data")
  ensureDir(dataDir)
  const file = path.join(dataDir, "app.db")
  const d = new Database(file)
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      wallet_address TEXT
    );
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY,
      artist_id INTEGER NOT NULL,
      album_title TEXT,
      mode TEXT,
      manifest_cid TEXT,
      cover_cid TEXT,
      dataset_id TEXT,
      created_at INTEGER,
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY,
      upload_id INTEGER NOT NULL,
      order_index INTEGER,
      title TEXT,
      audio_cid TEXT,
      lyrics_cid TEXT,
      iv_hex TEXT,
      tag_hex TEXT,
      track_id TEXT,
      duration_seconds INTEGER,
      price_per_minute_cents INTEGER,
      artist_wallet TEXT,
      FOREIGN KEY (upload_id) REFERENCES uploads(id)
    );
  `)
  d.close()
}

function main() {
  init()
  console.log("db initialized")
}

main()


