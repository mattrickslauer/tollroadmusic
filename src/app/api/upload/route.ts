import { NextResponse } from 'next/server'
import { getSynapse } from '@/server/synapse'
import { encryptAes256Gcm } from '@/server/crypto'
import { getDb, upsertArtist, insertUpload, insertTrack } from '@/server/db'

export const runtime = 'nodejs'

type TrackInput = {
  index: number
  title: string
  audio?: File
  lyrics?: File
  durationSeconds?: number
}

const PRICE_PER_MINUTE_CENTS = 1

function getText(fd: FormData, key: string) {
  const v = fd.get(key)
  if (typeof v === 'string') return v
  return ''
}

function getFile(fd: FormData, key: string) {
  const v = fd.get(key)
  if (v && typeof v !== 'string') return v as File
  return undefined
}

async function fileToBuffer(f?: File) {
  if (!f) return undefined
  const ab = await f.arrayBuffer()
  return Buffer.from(ab)
}

async function buildTracks(fd: FormData) {
  const list: TrackInput[] = []
  let i = 0
  while (i < 256) {
    const t = getText(fd, 'tracks[' + i + '][title]')
    const durText = getText(fd, 'tracks[' + i + '][durationSeconds]')
    const a = getFile(fd, 'tracks[' + i + '][audio]')
    const l = getFile(fd, 'tracks[' + i + '][lyrics]')
    if (!t && !a && !l) {
      if (i > 0) break
    }
    if (t || a || l) {
      let durationSeconds = 0
      if (durText) {
        const n = Number(durText)
        if (Number.isFinite(n) && n > 0) {
          durationSeconds = Math.floor(n)
        }
      }
      list.push({ index: i, title: t || '', audio: a, lyrics: l, durationSeconds })
    }
    i++
  }
  return list
}

export async function POST(req: Request) {
  try {
    console.log('upload:start')
    const fd = await req.formData()
    const mode = getText(fd, 'mode') || 'album'
    const albumTitle = getText(fd, 'albumTitle')
    const artist = getText(fd, 'artist')
    const artistWallet = getText(fd, 'artistWallet')
    const releaseDate = getText(fd, 'releaseDate')
    const genre = getText(fd, 'genre')
    const label = getText(fd, 'label')
    const explicit = getText(fd, 'explicit') === 'true' || getText(fd, 'explicit') === 'on'
    const description = getText(fd, 'description')
    const coverFile = getFile(fd, 'cover')
    console.log('upload:form', { mode, albumTitle, artist, artistWallet, releaseDate, genre, label, explicit, hasCover: !!coverFile })

    const tracks = await buildTracks(fd)
    console.log('upload:tracks:count', tracks.length)
    if (mode === 'single' && tracks.length > 1) {
      tracks.splice(1)
    }
    if (tracks.length === 0) {
      return NextResponse.json({ error: 'no tracks' }, { status: 400 })
    }

    const manifest = {
      album: {
        title: mode === 'single' ? (tracks[0]?.title || albumTitle) : albumTitle,
        artist,
        artistWallet,
        type: mode,
        cover: coverFile ? coverFile.name : '',
        releaseDate,
        genre,
        label,
        explicit,
        description
      },
      tracks: tracks.map(function (t, idx) {
        return {
          order: idx + 1,
          title: t.title || ('Track ' + (idx + 1)),
          file: t.audio ? { name: t.audio.name, mime: t.audio.type || 'audio/mpeg' } : null,
          lyrics: t.lyrics ? { name: t.lyrics.name, mime: t.lyrics.type || 'text/plain' } : null
        }
      })
    }
    const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8')
    console.log('upload:manifest:size', manifestBuf.length)

    console.log('upload:synapse:init')
    const synapse = await getSynapse()
    console.log('upload:synapse:ready')

    const coverBuf = await fileToBuffer(coverFile)
    let coverUp = null as any
    if (coverBuf) {
      console.log('upload:cover:size', coverBuf.length)
      try {
        coverUp = await (synapse as any).storage.upload(new Uint8Array(coverBuf))
        console.log('upload:cover:cid', coverUp?.pieceCid || '')
      } catch (e: any) {
        console.error('upload:cover:error', e?.message || '')
        throw e
      }
    }

    const items: Array<{
      order: number
      title: string
      audioCid?: string
      lyricsCid?: string
      ivHex?: string
      tagHex?: string
      durationSeconds?: number
      pricePerMinuteCents?: number
      trackId?: string
    }> = []

    try {
      const parallelItems = await Promise.all(
        tracks.map(function (t, i) {
          return processTrack(t, i, synapse)
        })
      )
      for (let i = 0; i < parallelItems.length; i++) {
        items.push(parallelItems[i])
      }
    } catch (e: any) {
      if (e && typeof e.message === 'string' && e.message.startsWith('empty audio at index ')) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    let manifestCid = ''
    try {
      const manUp = await (synapse as any).storage.upload(new Uint8Array(manifestBuf))
      manifestCid = manUp && (manUp as any).pieceCid != null ? String((manUp as any).pieceCid) : ''
      console.log('upload:manifest:cid', manifestCid)
    } catch (e: any) {
      console.error('upload:manifest:error', e?.message || '')
      throw e
    }

    const db = getDb()
    const artistId = upsertArtist(artist, artistWallet)
    console.log('db:artist:upserted', { artist, artistWallet, artistId })
    const coverCid = coverUp && (coverUp as any).pieceCid != null ? String((coverUp as any).pieceCid) : ''
    const uploadId = insertUpload(artistId, albumTitle, mode, manifestCid, coverCid, '')
    console.log('db:upload:inserted', { uploadId, artistId, albumTitle, mode, manifestCid, coverCid })
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const trackId = 'u' + uploadId + '-t' + it.order
      it.trackId = trackId
      const durationSeconds = typeof it.durationSeconds === 'number' && it.durationSeconds > 0 ? Math.floor(it.durationSeconds) : 0
      const pricePerMinuteCents = typeof it.pricePerMinuteCents === 'number' && it.pricePerMinuteCents > 0 ? Math.floor(it.pricePerMinuteCents) : PRICE_PER_MINUTE_CENTS
      insertTrack(
        uploadId,
        it.order,
        it.title,
        it.audioCid || '',
        it.lyricsCid || '',
        it.ivHex || '',
        it.tagHex || '',
        trackId,
        durationSeconds,
        pricePerMinuteCents,
        artistWallet || ''
      )
      console.log('db:track:inserted', { uploadId, order: it.order, title: it.title, audioCid: it.audioCid || '', lyricsCid: it.lyricsCid || '', trackId, durationSeconds, pricePerMinuteCents })
    }

    return NextResponse.json({
      datasetId: null,
      manifestCid,
      coverCid,
      items
    })
  } catch (e: any) {
    try {
      console.error('upload:error', e?.message || '')
      if (e && e.stack) console.error('upload:stack', e.stack)
    } catch (_ee) {
    }
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}

async function processTrack(t: TrackInput, i: number, synapse: any) {
  console.log('upload:track:start', { index: i, title: t.title, hasAudio: !!t.audio, hasLyrics: !!t.lyrics })
  let audioCid = ''
  let lyricsCid = ''
  let ivHex = ''
  let tagHex = ''
  let durationSeconds = 0
  let pricePerMinuteCents = PRICE_PER_MINUTE_CENTS
  if (typeof t.durationSeconds === 'number' && t.durationSeconds > 0) {
    durationSeconds = Math.floor(t.durationSeconds)
  }
  async function handleAudio() {
    if (!t.audio) return
    const audioBuf = await fileToBuffer(t.audio)
    if (!audioBuf || audioBuf.length === 0) {
      throw new Error('empty audio at index ' + i)
    }
    console.log('upload:track:audio:size', { index: i, bytes: audioBuf.length })
    const enc = encryptAes256Gcm(audioBuf)
    ivHex = enc.iv.toString('hex')
    tagHex = enc.tag.toString('hex')
    const payload = Buffer.concat([enc.iv, enc.tag, enc.ciphertext])
    console.log('upload:track:audio:encrypted:size', { index: i, bytes: payload.length })
    try {
      const up = await (synapse as any).storage.upload(new Uint8Array(payload))
      audioCid = up && (up as any).pieceCid != null ? String((up as any).pieceCid) : ''
      console.log('upload:track:audio:cid', { index: i, audioCid })
    } catch (e: any) {
      console.error('upload:track:audio:error', { index: i, message: e?.message || '' })
      throw e
    }
  }
  async function handleLyrics() {
    if (!t.lyrics) return
    const lb = await fileToBuffer(t.lyrics)
    if (lb && lb.length > 0) {
      console.log('upload:track:lyrics:size', { index: i, bytes: lb.length })
      try {
        const up = await (synapse as any).storage.upload(new Uint8Array(lb))
        lyricsCid = up && (up as any).pieceCid != null ? String((up as any).pieceCid) : ''
        console.log('upload:track:lyrics:cid', { index: i, lyricsCid })
      } catch (e: any) {
        console.error('upload:track:lyrics:error', { index: i, message: e?.message || '' })
        throw e
      }
    }
  }
  await Promise.all([handleAudio(), handleLyrics()])
  const item = {
    order: i + 1,
    title: t.title || ('Track ' + (i + 1)),
    audioCid,
    lyricsCid,
    ivHex,
    tagHex,
    durationSeconds,
    pricePerMinuteCents
  }
  console.log('upload:track:done', { index: i, audioCid, lyricsCid })
  return item
}


