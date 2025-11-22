'use client'

import { useState, useEffect } from 'react'
import { useEvmAddress } from '@coinbase/cdp-hooks'

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
    setArtistWallet((evmAddress as any) || '')
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
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1>Artist Upload</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #222' }}>
        <button
          type="button"
          onClick={function () { setMode('single') }}
          style={{ padding: '8px 12px', borderBottom: mode === 'single' ? '2px solid #fff' : '2px solid transparent' }}
        >
          Single
        </button>
        <button
          type="button"
          onClick={function () { setMode('album') }}
          style={{ padding: '8px 12px', borderBottom: mode === 'album' ? '2px solid #fff' : '2px solid transparent' }}
        >
          Album
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <fieldset style={{ marginBottom: 24 }}>
          <legend>Release</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {mode === 'album' ? (
              <div>
                <label>Title</label>
                <input value={albumTitle} onChange={function (e) { setAlbumTitle(e.target.value) }} required />
              </div>
            ) : null}
            <div>
              <label>Artist</label>
              <input value={artist} onChange={function (e) { setArtist(e.target.value) }} required />
            </div>
            <div>
              <label>Release Date</label>
              <input type="date" value={releaseDate} onChange={function (e) { setReleaseDate(e.target.value) }} />
            </div>
            <div>
              <label>Genre</label>
              <input value={genre} onChange={function (e) { setGenre(e.target.value) }} />
            </div>
            <div>
              <label>Label</label>
              <input value={label} onChange={function (e) { setLabel(e.target.value) }} />
            </div>
            <div>
              <label>Explicit</label>
              <input type="checkbox" checked={explicit} onChange={function (e) { setExplicit(e.target.checked) }} />
            </div>
            <div>
              <label>Cover</label>
              <input accept="image/*" type="file" onChange={function (e) { setCover(e.target.files?.[0]) }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea value={description} onChange={function (e) { setDescription(e.target.value) }} rows={4} />
            </div>
          </div>
        </fieldset>

        {mode === 'single' ? (
          <fieldset style={{ marginBottom: 24 }}>
            <legend>Track</legend>
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label>Title</label>
                  <input value={tracks[0]?.title || ''} onChange={function (e) { updateTrackTitle(tracks[0].id, e.target.value) }} required />
                </div>
                <div>
                  <label>Audio</label>
                  <input accept="audio/*" type="file" onChange={function (e) { updateTrackFile(tracks[0].id, e.target.files?.[0]) }} required />
                </div>
                <div>
                  <label>Lyrics</label>
                  <input accept=".lrc,.txt,text/plain" type="file" onChange={function (e) { updateTrackLyrics(tracks[0].id, e.target.files?.[0]) }} />
                </div>
              </div>
            </div>
          </fieldset>
        ) : (
          <fieldset style={{ marginBottom: 24 }}>
            <legend>Tracks</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tracks.map(function renderTrack(t, index) {
                return (
                  <div key={t.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label>Title</label>
                        <input value={t.title} onChange={function (e) { updateTrackTitle(t.id, e.target.value) }} required />
                      </div>
                      <div>
                        <label>Audio</label>
                        <input accept="audio/*" type="file" onChange={function (e) { updateTrackFile(t.id, e.target.files?.[0]) }} required />
                      </div>
                      <div>
                        <label>Lyrics</label>
                        <input accept=".lrc,.txt,text/plain" type="file" onChange={function (e) { updateTrackLyrics(t.id, e.target.files?.[0]) }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button type="button" onClick={function () { moveTrackUp(index) }}>Up</button>
                      <button type="button" onClick={function () { moveTrackDown(index) }}>Down</button>
                      <button type="button" onClick={function () { removeTrack(t.id) }} disabled={tracks.length <= 1}>Remove</button>
                    </div>
                  </div>
                )
              })}
              <div>
                <button type="button" onClick={addTrack}>Add Track</button>
              </div>
            </div>
          </fieldset>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit">Preview Manifest</button>
          <button type="button" onClick={uploadRelease} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Upload'}</button>
        </div>
      </form>

      {manifestPreview ? (
        <div style={{ marginTop: 24 }}>
          <h2>manifest.json</h2>
          <pre style={{ background: '#111', color: '#0f0', padding: 16, borderRadius: 8, overflowX: 'auto' }}>{manifestPreview}</pre>
        </div>
      ) : null}
      {uploadResult ? (
        <div style={{ marginTop: 24 }}>
          <h2>Upload Result</h2>
          <pre style={{ background: '#111', color: uploadResult.ok ? '#0f0' : '#f33', padding: 16, borderRadius: 8, overflowX: 'auto' }}>{JSON.stringify(uploadResult.data, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}

