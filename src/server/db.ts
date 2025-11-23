import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true })
  }
}

function init() {
  const dataDir = path.resolve(process.cwd(), 'data')
  ensureDir(dataDir)
  const file = path.join(dataDir, 'app.db')
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
  return d
}

export function getDb() {
  if (!db) {
    db = init()
  }
  return db
}

export function upsertArtist(name: string, wallet: string) {
  const d = getDb()
  const sel = d.prepare('SELECT id FROM artists WHERE name = ? AND wallet_address IS ?')
  const row = sel.get(name, wallet || null) as any
  if (row && row.id) {
    return row.id as number
  }
  const ins = d.prepare('INSERT INTO artists (name, wallet_address) VALUES (?, ?)')
  const r = ins.run(name, wallet || null)
  return Number(r.lastInsertRowid)
}

export function insertUpload(artistId: number, albumTitle: string, mode: string, manifestCid: string, coverCid: string, datasetId: string) {
  const d = getDb()
  const ins = d.prepare('INSERT INTO uploads (artist_id, album_title, mode, manifest_cid, cover_cid, dataset_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const r = ins.run(artistId, albumTitle || null, mode, manifestCid || null, coverCid || null, datasetId || null, Date.now())
  return Number(r.lastInsertRowid)
}

export function insertTrack(uploadId: number, orderIndex: number, title: string, audioCid: string, lyricsCid: string, ivHex: string, tagHex: string, trackId?: string, durationSeconds?: number, pricePerMinuteCents?: number, artistWallet?: string) {
  const d = getDb()
  const ins = d.prepare('INSERT INTO tracks (upload_id, order_index, title, audio_cid, lyrics_cid, iv_hex, tag_hex, track_id, duration_seconds, price_per_minute_cents, artist_wallet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  ins.run(
    uploadId,
    orderIndex,
    title || null,
    audioCid || null,
    lyricsCid || null,
    ivHex || null,
    tagHex || null,
    trackId || null,
    typeof durationSeconds === 'number' ? durationSeconds : null,
    typeof pricePerMinuteCents === 'number' ? pricePerMinuteCents : null,
    artistWallet || null
  )
}

export function getTrackByTrackId(trackId: string) {
  const d = getDb()
  const sel = d.prepare('SELECT * FROM tracks WHERE track_id = ?')
  const row = sel.get(trackId) as any
  if (!row) {
    return null
  }
  return row
}

export function getCatalogFromDb() {
  const d = getDb()
  const sel = d.prepare(`
    SELECT
      t.id AS track_row_id,
      t.track_id AS track_id,
      t.title AS track_title,
      t.duration_seconds AS duration_seconds,
      t.upload_id AS upload_id,
      u.album_title AS album_title,
      u.mode AS mode,
      u.cover_cid AS cover_cid,
      u.created_at AS created_at,
      a.name AS artist_name
    FROM tracks t
    JOIN uploads u ON t.upload_id = u.id
    JOIN artists a ON u.artist_id = a.id
    ORDER BY u.created_at DESC, t.order_index ASC
  `)
  const rows = sel.all() as any[]
  const albumsByUploadId = new Map<number, { id: string, title: string, artistName: string, coverPath: string, tracks: Array<{ id: string, title: string, durationSeconds: number, audioPath: string, albumId: string, artistName: string, coverPath: string }> }>()
  const allTracks: Array<{ id: string, title: string, durationSeconds: number, audioPath: string, albumId: string, artistName: string, coverPath: string }> = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const uploadId = Number(r.upload_id)
    if (!r.track_id) {
      continue
    }
    const albumId = String(uploadId)
    const artistName = r.artist_name || ''
    const coverPath = r.cover_cid ? '/api/cover/' + String(r.cover_cid) : '/logo.png'
    const durationSeconds = typeof r.duration_seconds === 'number' && Number.isFinite(r.duration_seconds) && r.duration_seconds > 0 ? Math.floor(r.duration_seconds) : 0
    const track = {
      id: String(r.track_id),
      title: r.track_title || '',
      durationSeconds,
      audioPath: '/api/stream/' + String(r.track_id),
      albumId,
      artistName,
      coverPath
    }
    let album = albumsByUploadId.get(uploadId)
    if (!album) {
      album = {
        id: albumId,
        title: r.album_title || track.title || 'Untitled',
        artistName,
        coverPath,
        tracks: []
      }
      albumsByUploadId.set(uploadId, album)
    }
    album.tracks.push(track)
    allTracks.push(track)
  }
  const albums = Array.from(albumsByUploadId.values())
  return { albums, tracks: allTracks }
}


