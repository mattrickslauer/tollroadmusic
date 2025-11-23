'use client'

import { useState, useEffect } from 'react'
import { useEvmAddress } from '@coinbase/cdp-hooks'
import { FOREGROUND, ACCENT } from '@/lib/colors'
import { normalizeAddressInput } from '@/lib/funds'

type TrackInput = {
  id: string
  title: string
  file?: File
  lyrics?: File
}

export default function Page() {
  const [albumTitle, setAlbumTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [artistWallet, setArtistWallet] = useState('')
  const [mode, setMode] = useState<'album' | 'single'>('album')
  const [releaseDate, setReleaseDate] = useState('')
  const [genre, setGenre] = useState('')
  const [label, setLabel] = useState('')
  const [explicit, setExplicit] = useState(false)
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState<File | undefined>(undefined)
  const [tracks, setTracks] = useState<TrackInput[]>([{ id: crypto.randomUUID(), title: '' }])
  const [manifestPreview, setManifestPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const evmAddress = useEvmAddress()

  useEffect(function syncArtistWalletFromCoinbase() {
    const addr = normalizeAddressInput(evmAddress as any)
    setArtistWallet(addr)
  }, [evmAddress])

  function addTrack() {
    setTracks(function next(prev) {
      return [...prev, { id: crypto.randomUUID(), title: '' }]
    })
  }

  function removeTrack(id: string) {
    setTracks(function next(prev) {
      if (prev.length <= 1) return prev
      return prev.filter(function keep(t) {
        return t.id !== id
      })
    })
  }

  function moveTrackUp(index: number) {
    setTracks(function next(prev) {
      if (index <= 0 || index >= prev.length) return prev
      const copy = prev.slice()
      const tmp = copy[index - 1]
      copy[index - 1] = copy[index]
      copy[index] = tmp
      return copy
    })
  }

  function moveTrackDown(index: number) {
    setTracks(function next(prev) {
      if (index < 0 || index >= prev.length - 1) return prev
      const copy = prev.slice()
      const tmp = copy[index + 1]
      copy[index + 1] = copy[index]
      copy[index] = tmp
      return copy
    })
  }

  function updateTrackTitle(id: string, value: string) {
    setTracks(function next(prev) {
      return prev.map(function mapTrack(t) {
        if (t.id === id) return { ...t, title: value }
        return t
      })
    })
  }

  function updateTrackFile(id: string, file?: File) {
    setTracks(function next(prev) {
      return prev.map(function mapTrack(t) {
        if (t.id === id) return { ...t, file }
        return t
      })
    })
  }

  function updateTrackLyrics(id: string, file?: File) {
    setTracks(function next(prev) {
      return prev.map(function mapTrack(t) {
        if (t.id === id) return { ...t, lyrics: file }
        return t
      })
    })
  }

  function buildManifestPreview() {
    const visibleTracks = mode === 'single' ? tracks.slice(0, 1) : tracks
    const trackItems = visibleTracks.map(function mapTrack(t, i) {
      return {
        order: i + 1,
        title: t.title || `Track ${i + 1}`,
        file: t.file ? { name: t.file.name, mime: t.file.type || 'audio/mpeg' } : null,
        lyrics: t.lyrics ? { name: t.lyrics.name, mime: t.lyrics.type || 'text/plain' } : null
      }
    })
    const releaseTitle = mode === 'single' ? (visibleTracks[0]?.title || albumTitle) : albumTitle
    const manifest = {
      album: {
        title: releaseTitle,
        artist,
        type: mode,
        cover: cover ? cover.name : '',
        releaseDate,
        genre,
        label,
        explicit,
        description
      },
      tracks: trackItems
    }
    setManifestPreview(JSON.stringify(manifest, null, 2))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    buildManifestPreview()
  }

  async function uploadRelease() {
    if (isUploading) return
    const visibleTracks = mode === 'single' ? tracks.slice(0, 1) : tracks
    const fd = new FormData()
    fd.append('mode', mode)
    fd.append('albumTitle', albumTitle)
    fd.append('artist', artist)
    fd.append('artistWallet', artistWallet)
    fd.append('releaseDate', releaseDate)
    fd.append('genre', genre)
    fd.append('label', label)
    fd.append('explicit', String(explicit))
    fd.append('description', description)
    if (cover) fd.append('cover', cover)
    visibleTracks.forEach(function (t, i) {
      fd.append('tracks[' + i + '][title]', t.title)
      if (t.file) fd.append('tracks[' + i + '][audio]', t.file)
      if (t.lyrics) fd.append('tracks[' + i + '][lyrics]', t.lyrics)
    })
    setIsUploading(true)
    setUploadResult(null)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      setUploadResult({ ok: res.ok, data: json })
    } catch (err) {
      setUploadResult({ ok: false, data: { error: 'network error' } })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', color: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 72, fontWeight: 900 }}>Artist Upload</h1>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          onClick={function () { setMode('single') }}
          style={{
            padding: '12px 18px',
            border: `2px solid ${FOREGROUND}`,
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 24,
            backgroundColor: mode === 'single' ? ACCENT : '#fff',
            color: mode === 'single' ? '#fff' : '#000',
            boxShadow: '0 8px 22px rgba(0,0,0,0.12)',
            cursor: 'pointer'
          }}
        >
          Single
        </button>
        <button
          type="button"
          onClick={function () { setMode('album') }}
          style={{
            padding: '12px 18px',
            border: `2px solid ${FOREGROUND}`,
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 24,
            backgroundColor: mode === 'album' ? ACCENT : '#fff',
            color: mode === 'album' ? '#fff' : '#000',
            boxShadow: '0 8px 22px rgba(0,0,0,0.12)',
            cursor: 'pointer'
          }}
        >
          Album
        </button>
      </div>
      <div style={{ border: `2px solid ${FOREGROUND}`, borderRadius: 12, background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,0.12)', padding: 20 }}>
        <form onSubmit={onSubmit}>
          <fieldset style={{ marginBottom: 24, border: `2px solid ${FOREGROUND}`, borderRadius: 12, padding: 16 }}>
            <legend style={{ fontSize: 48, fontWeight: 900, padding: '0 8px' }}>Release</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {mode === 'album' ? (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Title</label>
                <input value={albumTitle} onChange={function (e) { setAlbumTitle(e.target.value) }} required
                  style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
              </div>
            ) : null}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Artist</label>
              <input value={artist} onChange={function (e) { setArtist(e.target.value) }} required
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Release Date</label>
              <input type="date" value={releaseDate} onChange={function (e) { setReleaseDate(e.target.value) }}
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Genre</label>
              <input value={genre} onChange={function (e) { setGenre(e.target.value) }}
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Label</label>
              <input value={label} onChange={function (e) { setLabel(e.target.value) }}
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Explicit</label>
              <input type="checkbox" checked={explicit} onChange={function (e) { setExplicit(e.target.checked) }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Cover</label>
              <input accept="image/*" type="file" onChange={function (e) { setCover(e.target.files?.[0]) }}
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Description</label>
              <textarea value={description} onChange={function (e) { setDescription(e.target.value) }} rows={4}
                style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
            </div>
            </div>
          </fieldset>

          {mode === 'single' ? (
            <fieldset style={{ marginBottom: 24, border: `2px solid ${FOREGROUND}`, borderRadius: 12, padding: 16 }}>
              <legend style={{ fontSize: 48, fontWeight: 900, padding: '0 8px' }}>Track</legend>
              <div style={{ border: `2px solid ${FOREGROUND}`, borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Title</label>
                  <input value={tracks[0]?.title || ''} onChange={function (e) { updateTrackTitle(tracks[0].id, e.target.value) }} required
                    style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Audio</label>
                  <input accept="audio/*" type="file" onChange={function (e) { updateTrackFile(tracks[0].id, e.target.files?.[0]) }} required
                    style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Lyrics</label>
                  <input accept=".lrc,.txt,text/plain" type="file" onChange={function (e) { updateTrackLyrics(tracks[0].id, e.target.files?.[0]) }}
                    style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                </div>
              </div>
              </div>
            </fieldset>
          ) : (
            <fieldset style={{ marginBottom: 24, border: `2px solid ${FOREGROUND}`, borderRadius: 12, padding: 16 }}>
              <legend style={{ fontSize: 48, fontWeight: 900, padding: '0 8px' }}>Tracks</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tracks.map(function renderTrack(t, index) {
                return (
                  <div key={t.id} style={{ border: `2px solid ${FOREGROUND}`, borderRadius: 12, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Title</label>
                        <input value={t.title} onChange={function (e) { updateTrackTitle(t.id, e.target.value) }} required
                          style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Audio</label>
                        <input accept="audio/*" type="file" onChange={function (e) { updateTrackFile(t.id, e.target.files?.[0]) }} required
                          style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, fontSize: 20 }}>Lyrics</label>
                        <input accept=".lrc,.txt,text/plain" type="file" onChange={function (e) { updateTrackLyrics(t.id, e.target.files?.[0]) }}
                          style={{ width: '100%', border: `2px solid ${FOREGROUND}`, borderRadius: 10, padding: '8px 12px', fontSize: 18 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button type="button" onClick={function () { moveTrackUp(index) }}
                        style={{ padding: '10px 16px', border: `2px solid ${FOREGROUND}`, borderRadius: 10, fontWeight: 800, fontSize: 18, background: '#fff', cursor: 'pointer' }}
                      >Up</button>
                      <button type="button" onClick={function () { moveTrackDown(index) }}
                        style={{ padding: '10px 16px', border: `2px solid ${FOREGROUND}`, borderRadius: 10, fontWeight: 800, fontSize: 18, background: '#fff', cursor: 'pointer' }}
                      >Down</button>
                      <button type="button" onClick={function () { removeTrack(t.id) }} disabled={tracks.length <= 1}
                        style={{ padding: '10px 16px', border: `2px solid ${FOREGROUND}`, borderRadius: 10, fontWeight: 800, fontSize: 18, background: '#fff', cursor: tracks.length <= 1 ? 'not-allowed' : 'pointer', opacity: tracks.length <= 1 ? 0.5 : 1 }}
                      >Remove</button>
                    </div>
                  </div>
                )
              })}
              <div>
                <button type="button" onClick={addTrack}
                  style={{ padding: '12px 18px', backgroundColor: ACCENT, color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 20, boxShadow: '0 8px 22px rgba(0,0,0,0.12)', cursor: 'pointer' }}
                >Add Track</button>
              </div>
              </div>
            </fieldset>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit"
              style={{ padding: '12px 18px', border: `2px solid ${FOREGROUND}`, background: '#fff', color: '#000', borderRadius: 10, fontWeight: 800, fontSize: 24, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,0.12)' }}
            >Preview Manifest</button>
            <button type="button" onClick={uploadRelease} disabled={isUploading}
              style={{ padding: '12px 18px', backgroundColor: ACCENT, color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 24, cursor: isUploading ? 'wait' : 'pointer', opacity: isUploading ? 0.7 : 1, boxShadow: '0 8px 22px rgba(0,0,0,0.12)' }}
            >{isUploading ? 'Uploading...' : 'Upload'}</button>
          </div>
        </form>
      </div>

      {manifestPreview ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 48, fontWeight: 900, margin: '0 0 8px' }}>manifest.json</h2>
          <pre style={{ background: '#111', color: '#0f0', padding: 16, borderRadius: 12, overflowX: 'auto', border: `2px solid ${FOREGROUND}` }}>{manifestPreview}</pre>
        </div>
      ) : null}
      {uploadResult ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 48, fontWeight: 900, margin: '0 0 8px' }}>Upload Result</h2>
          <pre style={{ background: '#111', color: uploadResult.ok ? '#0f0' : '#f33', padding: 16, borderRadius: 12, overflowX: 'auto', border: `2px solid ${FOREGROUND}` }}>{JSON.stringify(uploadResult.data, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}

