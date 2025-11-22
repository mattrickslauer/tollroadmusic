import { NextResponse } from 'next/server'
import { getSynapse, getDatasetId } from '@/server/synapse'
import { encryptAes256Gcm } from '@/server/crypto'
import { getDb, upsertArtist, insertUpload, insertTrack } from '@/server/db'
import { TOKENS } from '@filoz/synapse-sdk'

export const runtime = 'nodejs'

type TrackInput = {
  index: number
  title: string
  audio?: File
  lyrics?: File
}

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
    const a = getFile(fd, 'tracks[' + i + '][audio]')
    const l = getFile(fd, 'tracks[' + i + '][lyrics]')
    if (!t && !a && !l) {
      if (i > 0) break
    }
    if (t || a || l) {
      list.push({ index: i, title: t || '', audio: a, lyrics: l })
    }
    i++
  }
  return list
}

async function getStorage(sdk: any, datasetId: string) {
  if (datasetId && sdk && sdk.storage && typeof sdk.storage.createContext === 'function') {
    try {
      const ctx = await sdk.storage.createContext({ datasetId })
      return ctx
    } catch (e) {
    }
  }
  return sdk.storage
}

async function uploadBuffer(storage: any, data: Buffer) {
  const u8 = new Uint8Array(data)
  const res = await storage.upload(u8)
  return res
}

export async function POST(req: Request) {
  try {
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

    const tracks = await buildTracks(fd)
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

    const synapse = await getSynapse()
    const datasetId = getDatasetId()
    const storage = await getStorage(synapse as any, datasetId)

    const bal = await synapse.payments.walletBalance(TOKENS.USDFC)
    if (typeof bal === 'bigint') {
      if (bal <= 0n) {
        return NextResponse.json({ error: 'insufficient USDFC' }, { status: 402 })
      }
    }

    const coverBuf = await fileToBuffer(coverFile)
    const coverUp = coverBuf ? await uploadBuffer(storage, coverBuf) : null

    const items: Array<{
      order: number
      title: string
      audioCid?: string
      lyricsCid?: string
      ivHex?: string
      tagHex?: string
    }> = []

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i]
      let audioCid = ''
      let lyricsCid = ''
      let ivHex = ''
      let tagHex = ''
      if (t.audio) {
        const audioBuf = await fileToBuffer(t.audio)
        if (!audioBuf || audioBuf.length === 0) {
          return NextResponse.json({ error: 'empty audio at index ' + i }, { status: 400 })
        }
        const enc = encryptAes256Gcm(audioBuf)
        ivHex = enc.iv.toString('hex')
        tagHex = enc.tag.toString('hex')
        const payload = Buffer.concat([enc.iv, enc.tag, enc.ciphertext])
        const up = await uploadBuffer(storage, payload)
        audioCid = up.pieceCid || ''
      }
      if (t.lyrics) {
        const lb = await fileToBuffer(t.lyrics)
        if (lb && lb.length > 0) {
          const up = await uploadBuffer(storage, lb)
          lyricsCid = up.pieceCid || ''
        }
      }
      items.push({
        order: i + 1,
        title: t.title || ('Track ' + (i + 1)),
        audioCid,
        lyricsCid,
        ivHex,
        tagHex
      })
    }

    const manUp = await uploadBuffer(storage, manifestBuf)
    const manifestCid = manUp.pieceCid || ''

    const db = getDb()
    const artistId = upsertArtist(artist, artistWallet)
    const uploadId = insertUpload(artistId, albumTitle, mode, manifestCid, coverUp ? (coverUp.pieceCid || '') : '', datasetId || '')
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      insertTrack(uploadId, it.order, it.title, it.audioCid || '', it.lyricsCid || '', it.ivHex || '', it.tagHex || '')
    }

    return NextResponse.json({
      datasetId: datasetId || null,
      manifestCid,
      coverCid: coverUp ? (coverUp.pieceCid || '') : null,
      items
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}


