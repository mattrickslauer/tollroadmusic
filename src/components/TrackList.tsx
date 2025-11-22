'use client'

import { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";

type Props = {
  title: string;
  tracks: Track[];
};

export default function TrackList(props: Props) {
  const { title, tracks } = props;
  const player = usePlayer();
  if (!player) return null;

  function onPlay(track: Track) {
    player.playTrack(track, tracks);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
      </div>
      <div role="table" aria-label={`${title} table`} style={{ border: "1px dashed #000", borderRadius: 10, overflow: "hidden" }}>
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 96px 96px",
            gap: 8,
            padding: 12,
            background: "repeating-linear-gradient(135deg, #f1f1f1, #f1f1f1 8px, #e9e9e9 8px, #e9e9e9 16px)",
            fontWeight: 600,
          }}
        >
          <div>Title</div>
          <div>Length</div>
          <div style={{ textAlign: "right" }}>Action</div>
        </div>
        {tracks.map(function render(track) {
          return (
            <div
              key={track.id}
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 96px 96px",
                gap: 8,
                padding: 12,
                borderTop: "1px dashed #000",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    background: "repeating-linear-gradient(135deg, #eaeaea, #eaeaea 8px, #dcdcdc 8px, #dcdcdc 16px)",
                    flex: "0 0 auto",
                  }}
                  title="Cover art"
                />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", maxWidth: "100%" }}>
                    {track.title}
                  </div>
                  <div style={{ fontSize: 24, opacity: 0.6 }}>{track.artistName}</div>
                </div>
              </div>
              <div>{formatDuration(track.durationSeconds)}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={function handle() { onPlay(track); }}
                  style={{
                    padding: "6px 10px",
                    border: "1px dashed #000",
                    borderRadius: 8,
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "var(--font-jomhuria)",
                    fontSize: 26,
                  }}
                  aria-label="Play"
                >
                  Play
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDuration(s: number) {
  const t = Math.floor(s);
  const m = Math.floor(t / 60);
  const r = t % 60;
  const rr = r < 10 ? `0${r}` : `${r}`;
  return `${m}:${rr}`;
}


