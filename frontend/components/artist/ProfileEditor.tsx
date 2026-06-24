"use client";

import { useState, useRef } from "react";
import CoverImage from "@/components/listen/CoverImage";
import {
  uploadImage,
  presignAvatar,
  commitAvatar,
  presignCover,
  commitCover,
  updateArtistProfile,
  ApiError,
} from "@/lib/api/client";
import type { ArtistTrack } from "@/lib/api/types";

type ArtistInfo = {
  id: string;
  name: string;
  genre: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  avatarKey: string | null;
};

type Props = {
  artist: ArtistInfo;
  tracks: ArtistTrack[];
};

export default function ProfileEditor({ artist, tracks }: Props) {
  // --- Avatar state ---
  const [avatarKey, setAvatarKey] = useState<string | null>(artist.avatarKey ?? null);
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // --- Profile form state ---
  const [bio, setBio] = useState(artist.bio ?? "");
  const [location, setLocation] = useState(artist.location ?? "");
  const [website, setWebsite] = useState(artist.website ?? "");
  const [genre, setGenre] = useState(artist.genre ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Per-track cover state ---
  const [coverKeys, setCoverKeys] = useState<Record<string, string | null>>(
    Object.fromEntries(tracks.map((t) => [t.id, t.coverImageKey ?? null])),
  );
  const [coverStatuses, setCoverStatuses] = useState<Record<string, "idle" | "uploading" | "error">>(
    Object.fromEntries(tracks.map((t) => [t.id, "idle"])),
  );
  const [coverErrors, setCoverErrors] = useState<Record<string, string | null>>(
    Object.fromEntries(tracks.map((t) => [t.id, null])),
  );

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarStatus("uploading");
    setAvatarError(null);
    try {
      const key = await uploadImage(file, presignAvatar, commitAvatar);
      setAvatarKey(key);
      setAvatarStatus("idle");
    } catch (err) {
      setAvatarStatus("error");
      setAvatarError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function handleSaveProfile() {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const fields: Record<string, string> = {};
      if (bio) fields.bio = bio;
      if (location) fields.location = location;
      if (website) fields.website = website;
      if (genre) fields.genre = genre;
      await updateArtistProfile(fields);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleCoverChange(trackId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverStatuses((s) => ({ ...s, [trackId]: "uploading" }));
    setCoverErrors((s) => ({ ...s, [trackId]: null }));
    try {
      const key = await uploadImage(
        file,
        (ct) => presignCover(trackId, ct),
        (k) => commitCover(trackId, k),
      );
      setCoverKeys((s) => ({ ...s, [trackId]: key }));
      setCoverStatuses((s) => ({ ...s, [trackId]: "idle" }));
    } catch (err) {
      setCoverStatuses((s) => ({ ...s, [trackId]: "error" }));
      setCoverErrors((s) => ({
        ...s,
        [trackId]: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="az-editor">
      {/* ── Avatar ─────────────────────────────────────────────────── */}
      <section className="az-editor-section">
        <h2 className="az-recent-h">Profile photo</h2>
        <div className="az-avatar-row">
          <CoverImage coverKey={avatarKey} className="az-avatar" alt={artist.name} />
          <div className="az-avatar-controls">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="az-file-input"
              id="avatar-upload"
              onChange={handleAvatarChange}
              disabled={avatarStatus === "uploading"}
            />
            <label htmlFor="avatar-upload" className="btn btn-secondary az-upload-btn">
              {avatarStatus === "uploading" ? "Uploading…" : "Change photo"}
            </label>
            {avatarStatus === "error" && avatarError && (
              <p className="az-field-error">{avatarError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Profile form ───────────────────────────────────────────── */}
      <section className="az-editor-section">
        <h2 className="az-recent-h">Profile info</h2>
        <div className="az-form">
          <div className="az-field">
            <label className="az-label" htmlFor="profile-bio">Bio</label>
            <textarea
              id="profile-bio"
              className="az-input az-textarea"
              rows={4}
              maxLength={600}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell listeners about yourself…"
            />
          </div>
          <div className="az-field">
            <label className="az-label" htmlFor="profile-location">Location</label>
            <input
              id="profile-location"
              className="az-input"
              type="text"
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
            />
          </div>
          <div className="az-field">
            <label className="az-label" htmlFor="profile-website">Website</label>
            <input
              id="profile-website"
              className="az-input"
              type="url"
              maxLength={200}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com"
            />
          </div>
          <div className="az-field">
            <label className="az-label" htmlFor="profile-genre">Genre</label>
            <input
              id="profile-genre"
              className="az-input"
              type="text"
              maxLength={40}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g. Electronic, Jazz, Hip-Hop"
            />
          </div>
          <div className="az-form-footer">
            <button
              className="btn btn-primary"
              onClick={handleSaveProfile}
              disabled={saveStatus === "saving"}
            >
              {saveStatus === "saving" ? "Saving…" : "Save profile"}
            </button>
            {saveStatus === "saved" && <span className="az-save-ok">Saved.</span>}
            {saveStatus === "error" && saveError && (
              <span className="az-field-error">{saveError}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Per-track covers ───────────────────────────────────────── */}
      {tracks.length > 0 && (
        <section className="az-editor-section">
          <h2 className="az-recent-h">Track covers</h2>
          <div className="az-track-covers">
            {tracks.map((t) => (
              <div key={t.id} className="az-track-cover-row">
                <CoverImage coverKey={coverKeys[t.id]} className="az-cover-thumb" alt={t.title} />
                <div className="az-track-cover-meta">
                  <span className="az-track-title">{t.title}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="az-file-input"
                    id={`cover-upload-${t.id}`}
                    onChange={(e) => handleCoverChange(t.id, e)}
                    disabled={coverStatuses[t.id] === "uploading"}
                  />
                  <label htmlFor={`cover-upload-${t.id}`} className="btn btn-secondary az-upload-btn">
                    {coverStatuses[t.id] === "uploading" ? "Uploading…" : "Change cover"}
                  </label>
                  {coverStatuses[t.id] === "error" && coverErrors[t.id] && (
                    <p className="az-field-error">{coverErrors[t.id]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
