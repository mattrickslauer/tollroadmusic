"use client";

// /playlist/[id] — a single playlist. Three viewer states:
//   (a) owner: play-all + delete + visibility toggle + share link
//   (b) logged-in non-owner of a PUBLIC playlist: read-only, plays normally
//   (c) logged-out visitor of a PUBLIC playlist: read-only, "sign in to play"
// The ?r=<handle> referral on a shared link is captured and stashed so it can be
// attached as signup attribution when the visitor signs in.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CatalogTrack, PlaylistDetail, PublicPlaylist } from "@/lib/api/types";
import { usePlayer } from "@/context/PlayerProvider";
import { useLibrary } from "@/context/LibraryProvider";
import { fetchMe, saveRef, type Me } from "@/lib/auth";
import TrackList from "@/components/listen/TrackList";
import SignInSheet from "@/components/SignInSheet";
import { SkeletonHero, SkeletonTrackList } from "@/components/listen/Skeleton";
import * as api from "@/lib/api/client";

type Loaded = PlaylistDetail | PublicPlaylist;

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { play } = usePlayer();
  const { refreshPlaylists } = useLibrary();

  const [pl, setPl] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState(false);

  // Capture the ?r=<handle> referral from the URL (no useSearchParams — that
  // forces a Suspense boundary at build time).
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("r");
    if (r) saveRef(r);
  }, []);

  // Load: prefer the owner view when signed in, else fall back to the public
  // read. Public read works for both logged-in non-owners and logged-out users.
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await fetchMe();
      if (!alive) return;
      setMe(m);

      if (m.account) {
        try {
          const owned = await api.getPlaylist(id);
          if (!alive) return;
          setPl(owned);
          setIsOwner(true);
          setVisibility(owned.visibility);
          return;
        } catch {
          /* not the owner (404/401) — try the public read below */
        }
      }
      try {
        const pub = await api.getPublicPlaylist(id);
        if (!alive) return;
        setPl(pub);
        setIsOwner(false);
        setVisibility("public");
      } catch {
        if (alive) setMissing(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function remove(trackId: string) {
    await api.removeFromPlaylist(id, trackId).catch(() => {});
    setPl((prev) => (prev ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== trackId) } : prev));
    refreshPlaylists();
  }

  async function del() {
    if (!confirm("Delete this playlist?")) return;
    await api.deletePlaylist(id).catch(() => {});
    refreshPlaylists();
    router.push("/library");
  }

  async function toggleVisibility() {
    const next = visibility === "public" ? "private" : "public";
    setVisibility(next); // optimistic
    try {
      await api.setPlaylistVisibility(id, next);
      refreshPlaylists();
    } catch {
      setVisibility(visibility); // revert
    }
  }

  function copyShareLink() {
    const handle = me?.account?.handle;
    let url = `${window.location.origin}/playlist/${id}`;
    if (handle) url += `?r=${encodeURIComponent(handle)}`;

    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(confirm, fallbackCopy);
    } else {
      fallbackCopy();
    }

    // Older browsers / insecure contexts lack the async Clipboard API.
    function fallbackCopy() {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand("copy")) confirm();
      } catch {
        /* clipboard unavailable — leave the button label unchanged */
      }
      document.body.removeChild(ta);
    }
  }

  if (missing) return <p className="lx-empty">That playlist doesn&apos;t exist.</p>;
  if (!pl) {
    return (
      <>
        <SkeletonHero />
        <SkeletonTrackList />
      </>
    );
  }

  const ownerName = "ownerName" in pl ? pl.ownerName : null;
  const loggedIn = Boolean(me?.account);
  // Logged-out public visitor: row plays + Play all open the sign-in sheet.
  const gatePlay = !isOwner && !loggedIn;
  const onRowPlay = gatePlay ? (() => setSheet(true)) as (t: CatalogTrack, q: CatalogTrack[]) => void : undefined;

  function playAll() {
    if (gatePlay) {
      setSheet(true);
      return;
    }
    if (pl && pl.tracks.length > 0) play(pl.tracks[0], pl.tracks);
  }

  return (
    <>
      <header className="lx-head lx-head-hero">
        <span className="lx-hero-art" aria-hidden="true">{pl.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="lx-eyebrow">{!isOwner && ownerName ? `Shared by ${ownerName}` : "Playlist"}</span>
          <h1 className="lx-h1">{pl.name}</h1>
          <p className="lx-sub">{pl.tracks.length} song{pl.tracks.length === 1 ? "" : "s"}</p>
          <div className="lx-head-actions">
            {pl.tracks.length > 0 && <button className="lx-playall" onClick={playAll}>▶ Play all</button>}
            {gatePlay && <button className="lx-playall" onClick={() => setSheet(true)}>Sign in to play</button>}
            {isOwner && (
              <>
                <button className="lx-vis" onClick={toggleVisibility}>
                  {visibility === "public" ? "🌐 Public" : "🔒 Private"}
                </button>
                {visibility === "public" && (
                  <button
                    className="lx-share"
                    data-copied={copied}
                    onClick={copyShareLink}
                    aria-live="polite"
                  >
                    {copied ? "✓ Link copied" : "Copy share link"}
                  </button>
                )}
                <button className="lx-delete" onClick={del}>Delete playlist</button>
              </>
            )}
          </div>
        </div>
      </header>

      {pl.tracks.length === 0 ? (
        <p className="lx-empty">This playlist is empty — add tracks from the browse page.</p>
      ) : isOwner ? (
        <TrackList tracks={pl.tracks} onRemove={remove} removeLabel="Remove from playlist" />
      ) : (
        <TrackList tracks={pl.tracks} onPlay={onRowPlay} />
      )}

      {sheet && (
        <SignInSheet
          reason="Sign in to listen to this playlist."
          onClose={() => setSheet(false)}
          onSignedIn={(m) => {
            setMe(m);
            setSheet(false);
          }}
        />
      )}
    </>
  );
}
