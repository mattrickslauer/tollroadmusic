"use client";

import { useState } from "react";
import {
  createTrack,
  presignAudio,
  commitAudio,
  updateTrack,
  deleteTrack,
  ApiError,
} from "@/lib/api/client";
import type { ArtistTrack } from "@/lib/api/types";

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SongManager({ initialTracks }: { initialTracks: ArtistTrack[] }) {
  const [tracks, setTracks] = useState<ArtistTrack[]>(initialTracks);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function probeDuration(f: File): Promise<number> {
    // Read duration from the audio metadata; fall back to 180s if unavailable.
    return new Promise((resolve) => {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Math.max(1, Math.round(el.duration || 180)));
      el.onerror = () => resolve(180);
      el.src = URL.createObjectURL(f);
    });
  }

  async function onAdd() {
    if (!title.trim() || !file) {
      setMsg("Title and an audio file are required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const durationSeconds = await probeDuration(file);
      const { id } = await createTrack({ title: title.trim(), durationSeconds });
      const { uploadUrl, key } = await presignAudio(id, file.type);
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      await commitAudio(id, key);
      setTracks((t) => [
        { id, title: title.trim(), durationSeconds, pricePerMinuteMillicents: 1000, coverImageKey: null, isActive: true },
        ...t,
      ]);
      setTitle("");
      setFile(null);
      setMsg("Song added.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(track: ArtistTrack) {
    const next = window.prompt("New title", track.title);
    if (!next || next.trim() === track.title) return;
    try {
      await updateTrack(track.id, { title: next.trim() });
      setTracks((t) => t.map((x) => (x.id === track.id ? { ...x, title: next.trim() } : x)));
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "rename failed");
    }
  }

  async function onDelete(track: ArtistTrack) {
    if (!window.confirm(`Delete "${track.title}"? It will be hidden from the catalog.`)) return;
    try {
      await deleteTrack(track.id);
      setTracks((t) => t.filter((x) => x.id !== track.id));
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "delete failed");
    }
  }

  return (
    <section className="az-card">
      <h2 className="az-card-title">Your songs</h2>

      <div className="az-add-song">
        <input
          type="text"
          placeholder="Song title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <input
          type="file"
          accept="audio/mpeg,audio/mp4,audio/wav,audio/flac,audio/aac"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={onAdd} disabled={busy}>
          {busy ? "Uploading…" : "Add song"}
        </button>
      </div>

      <ul className="az-song-list">
        {tracks.map((t) => (
          <li key={t.id} className={t.isActive ? "" : "az-inactive"}>
            <span>{t.title}</span>
            <span className="az-muted">{dur(t.durationSeconds)}</span>
            <button className="btn btn-ghost" onClick={() => onRename(t)}>Rename</button>
            <button className="btn btn-ghost" onClick={() => onDelete(t)}>Delete</button>
          </li>
        ))}
      </ul>

      {msg && <p className="az-note">{msg}</p>}
    </section>
  );
}
