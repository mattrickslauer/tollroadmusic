import { ImageResponse } from "next/og";

// Brand palette (mirrors app/globals.css — ImageResponse can't read CSS vars).
const ASPHALT = "#08080a";
const ASPHALT_2 = "#101015";
const BONE = "#f4efe3";
const BONE_DIM = "#b7b2a6";
const AMBER = "#ffb02e";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** The shared 1200×630 link-preview card for a song or an artist: cover art on
 *  the left, eyebrow + title + subtitle + price badge on the right, over the
 *  brand dark gradient with an amber glow. Falls back to a gradient tile with
 *  the first letter when there is no cover. One renderer, two callers. */
export function shareCard({
  eyebrow,
  title,
  subtitle,
  badge,
  coverUrl,
  rounded,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: string;
  coverUrl: string | null;
  rounded?: boolean;
}) {
  const letter = (title.trim()[0] || "♪").toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: 72,
          background: `radial-gradient(900px 600px at 12% 0%, rgba(255,176,46,0.16), transparent 60%), ${ASPHALT}`,
          fontFamily: "sans-serif",
        }}
      >
        {/* cover / fallback tile */}
        <div
          style={{
            width: 420,
            height: 420,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: rounded ? 210 : 28,
            overflow: "hidden",
            background: `linear-gradient(135deg, ${ASPHALT_2}, ${ASPHALT})`,
            boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={coverUrl} width={420} height={420} style={{ objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #ffe1a0 0%, #ffb02e 46%, #c77f12 100%)",
                color: ASPHALT,
                fontSize: 200,
                fontWeight: 700,
              }}
            >
              {letter}
            </div>
          )}
        </div>

        {/* text column */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, letterSpacing: 4, color: AMBER, fontWeight: 700 }}>
            {eyebrow.toUpperCase()}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              lineHeight: 1.05,
              fontWeight: 800,
              color: BONE,
              marginTop: 14,
              // clamp to 3 lines so long titles never overflow the card
              maxHeight: 252,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: BONE_DIM, marginTop: 18 }}>{subtitle}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 36 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, color: BONE }}>
              <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, background: AMBER, marginRight: 14 }} />
              TollRoad
            </div>
            {badge ? (
              <div
                style={{
                  display: "flex",
                  marginLeft: 24,
                  padding: "8px 18px",
                  borderRadius: 999,
                  background: "rgba(255,176,46,0.16)",
                  color: AMBER,
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {badge}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
