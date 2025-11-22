'use client'

import Image from "next/image";
import { Album } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";

type Props = {
  title: string;
  albums: Album[];
};

export default function AlbumCarousel(props: Props) {
  const { title, albums } = props;
  const player = usePlayer();
  if (!player) return null;
  const p = player;

  function onPlayAlbum(album: Album) {
    p.setQueue(album.tracks, 0);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "grid", gridAutoFlow: "column", gap: 12 }}>
          {albums.map(function render(album) {
            return (
              <button
                key={album.id}
                type="button"
                onClick={function handle() { onPlayAlbum(album); }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  width: 160,
                  textAlign: "left",
                  background: "transparent",
                  border: "1px dashed #000",
                  borderRadius: 10,
                  padding: 8,
                  cursor: "pointer",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: "100%",
                    height: 160,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#eee",
                  }}
                >
                  <Image
                    src={album.coverPath}
                    alt={album.title}
                    width={160}
                    height={160}
                    style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {album.title}
                  </div>
                  <div style={{ opacity: 0.7, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {album.artistName}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


