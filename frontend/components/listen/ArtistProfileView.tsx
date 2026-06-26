"use client";

import type { ArtistProfile } from "@/lib/api/types";
import CoverImage from "./CoverImage";
import TrackCard from "./TrackCard";
import ShareButton from "./ShareButton";
import { artistPath } from "@/lib/shareUrls";
import BondCard from "@/components/bond/BondCard";
import SuperfanLeaderboard from "@/components/bond/SuperfanLeaderboard";

/** Public artist profile view. Renders the artist's avatar, name, meta line
 *  (genre · location), bio, optional website link, and a playable track grid
 *  reusing the same TrackCard tiles as the catalog browse view. */
export default function ArtistProfileView({ profile }: { profile: ArtistProfile }) {
  const { artist, tracks } = profile;

  const meta = [artist.genre, artist.location].filter(Boolean).join(" · ");

  return (
    <>
      <header className="lx-head">
        <div className="lx-artist-avatar">
          <CoverImage coverKey={artist.avatarKey} alt={artist.name} loading="eager" />
        </div>
        <div className="lx-head-titlerow">
          <h1 className="lx-h1">{artist.name}</h1>
          <ShareButton path={artistPath({ id: artist.id, name: artist.name })} title={artist.name} size={18} />
        </div>
        {meta && <p className="lx-eyebrow">{meta}</p>}
        {artist.bio && <p className="lx-sub">{artist.bio}</p>}
        {artist.website && (
          <a
            className="lx-link"
            href={artist.website}
            rel="noopener noreferrer"
            target="_blank"
          >
            {artist.website}
          </a>
        )}
      </header>

      <BondCard artistId={artist.id} artistName={artist.name} />

      {tracks.length === 0 ? (
        <p className="lx-empty">No tracks yet.</p>
      ) : (
        <div className="lx-grid">
          {tracks.map((t) => (
            <TrackCard key={t.id} track={t} queue={tracks} />
          ))}
        </div>
      )}

      <SuperfanLeaderboard artistId={artist.id} />
    </>
  );
}
