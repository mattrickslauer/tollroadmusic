'use client'

import { useCurrentUser } from "@coinbase/cdp-hooks";
import { useMemo } from "react";
import { catalog } from "@/lib/catalog";
import AlbumCarousel from "@/components/AlbumCarousel";
import TrackList from "@/components/TrackList";
import RequireSignIn from "@/components/RequireSignIn";

export default function ListenerPage() {
  const { currentUser } = useCurrentUser();
  const featuredAlbums = useMemo(function getA() { return catalog.albums.slice(0, 4); }, []);
  const newReleases = useMemo(function getB() { return catalog.albums.slice(0, 4).reverse(); }, []);
  const trendingTracks = useMemo(function getC() { return catalog.tracks.slice(0, 8); }, []);

  return (
    <RequireSignIn>
      <div
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "24px 16px",
          color: "#000",
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 36, fontWeight: 800 }}>Your Music</div>
              <div style={{ opacity: 0.7, fontSize: 24 }}>
                {currentUser?.userId ? `Signed in as ${currentUser.userId}` : "Connect wallet to personalize"}
              </div>
            </div>
          </div>

          <AlbumCarousel title="Featured Albums" albums={featuredAlbums} />
          <AlbumCarousel title="New Releases" albums={newReleases} />
          <TrackList title="Trending Tracks" tracks={trendingTracks} />
        </div>
      </div>
    </RequireSignIn>
  );
}


