'use client'

import Link from "next/link";

export default function ArtistSettingsPage() {
  return (
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
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/artist"
            style={{
              padding: "6px 10px",
              border: "1px dashed #000",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            ← Back
          </Link>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Artist Settings</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px dashed #000",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>Profile</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background:
                    "repeating-linear-gradient(135deg, #eaeaea, #eaeaea 8px, #dcdcdc 8px, #dcdcdc 16px)",
                }}
              />
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  border: "1px dashed #000",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Change Photo
              </button>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Artist Name</span>
              <input
                placeholder="Your Artist Name"
                style={{
                  padding: "10px 12px",
                  border: "1px dashed #000",
                  borderRadius: 8,
                  background: "transparent",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Bio</span>
              <textarea
                placeholder="Short bio"
                rows={4}
                style={{
                  padding: "10px 12px",
                  border: "1px dashed #000",
                  borderRadius: 8,
                  background: "transparent",
                  resize: "vertical",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={{
                  padding: "10px 14px",
                  border: "1px dashed #000",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                type="button"
                style={{
                  padding: "10px 14px",
                  border: "1px dashed #000",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


