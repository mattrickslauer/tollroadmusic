// Loading shells. These mirror the real component DOM/dimensions so the layout
// doesn't shift when data arrives — and they show NO data, just shimmering
// blocks, so a listener never sees fake/placeholder values mid-load. Pure
// presentational (no hooks) so they work in both client components and the
// route-level loading.tsx server files.
import type { CSSProperties } from "react";

/** A single shimmering block. Size via width/height (CSS lengths) or className. */
export function Sk({
  w,
  h,
  radius,
  className,
  style,
}: {
  w?: string | number;
  h?: string | number;
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`lx-sk${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
    />
  );
}

/** Recently-played rail: a row of square-art cards with two text lines each. */
export function SkeletonRail({ count = 6 }: { count?: number }) {
  return (
    <section className="lx-rail" aria-hidden="true">
      <h2 className="lx-section-h">Recently played</h2>
      <div className="lx-rail-track">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="lx-rail-item lx-sk-item">
            <Sk className="lx-sk-square" radius={8} />
            <Sk h={11} w="80%" radius={4} />
            <Sk h={9} w="55%" radius={4} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Catalog filter chips (genre pills + search box). */
export function SkeletonFilters() {
  return (
    <div className="lx-filters" aria-hidden="true">
      <Sk h={44} w="100%" radius={999} style={{ maxWidth: 420 }} />
      <div className="lx-chips">
        {[60, 78, 52, 90, 66, 48].map((w, i) => (
          <Sk key={i} h={32} w={w} radius={999} />
        ))}
      </div>
    </div>
  );
}

/** A grid of track tiles (cover + title + artist + foot meta). */
export function SkeletonTrackGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="lx-grid" role="status" aria-busy="true">
      <span className="lx-sr-only">Loading tracks…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="lx-card lx-sk-card" aria-hidden="true">
          <Sk className="lx-sk-square" radius={10} />
          <div className="lx-card-meta">
            <Sk h={13} w="85%" radius={4} />
            <Sk h={11} w="60%" radius={4} style={{ marginTop: 8 }} />
          </div>
          <div className="lx-card-foot">
            <Sk h={10} w={70} radius={4} style={{ marginLeft: "auto" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A dense numbered track list (Liked Songs, playlists). */
export function SkeletonTrackList({ count = 8 }: { count?: number }) {
  return (
    <div className="lx-rows" role="status" aria-busy="true">
      <span className="lx-sr-only">Loading tracks…</span>
      <div className="lx-row lx-row-head" aria-hidden="true">
        <span className="lx-row-idx">#</span>
        <span className="lx-row-title">Title</span>
        <span className="lx-row-rate">Rate</span>
        <span className="lx-row-dur">Time</span>
        <span className="lx-row-actions" />
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="lx-row lx-sk-row" aria-hidden="true">
          <span className="lx-row-idx">
            <Sk h={12} w={12} radius={3} />
          </span>
          <span className="lx-row-title">
            <Sk className="lx-row-cover" radius={6} />
            <span className="lx-row-text">
              <Sk h={12} w={160} radius={4} />
              <Sk h={10} w={100} radius={4} style={{ marginTop: 7 }} />
            </span>
          </span>
          <span className="lx-row-rate">
            <Sk h={10} w={48} radius={4} />
          </span>
          <span className="lx-row-dur">
            <Sk h={10} w={34} radius={4} />
          </span>
          <span className="lx-row-actions" />
        </div>
      ))}
    </div>
  );
}

/** A hero header (large square art + eyebrow/title/subtitle lines). */
export function SkeletonHero({ liked = false }: { liked?: boolean }) {
  return (
    <header className="lx-head lx-head-hero" aria-hidden="true">
      <Sk className={`lx-hero-art lx-sk-hero-art${liked ? " lx-sk-hero-liked" : ""}`} radius={14} />
      <div className="lx-sk-hero-lines">
        <Sk h={11} w={70} radius={4} />
        <Sk h={34} w={260} radius={6} style={{ marginTop: 12 }} />
        <Sk h={12} w={120} radius={4} style={{ marginTop: 14 }} />
        <Sk h={40} w={130} radius={999} style={{ marginTop: 16 }} />
      </div>
    </header>
  );
}

/** A library playlist tile (square art + title + sub line). */
export function SkeletonPlaylistCard() {
  return (
    <div className="lx-card lx-pcard lx-sk-card" aria-hidden="true">
      <Sk className="lx-sk-square" radius={10} />
      <div className="lx-card-meta">
        <Sk h={13} w="80%" radius={4} />
        <Sk h={11} w="50%" radius={4} style={{ marginTop: 8 }} />
      </div>
    </div>
  );
}

/** The wallet view: balance card, stat row, and a history list. */
export function SkeletonWallet() {
  return (
    <div role="status" aria-busy="true">
      <span className="lx-sr-only">Loading wallet…</span>
      <div className="wallet-top" aria-hidden="true">
        <div className="wallet-balance">
          <Sk h={11} w={90} radius={4} />
          <Sk h={36} w={150} radius={6} style={{ marginTop: 12 }} />
        </div>
        <Sk h={42} w={120} radius={999} />
      </div>
      <div className="wallet-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cat-stat">
            <Sk h={26} w={80} radius={6} />
            <Sk h={11} w={100} radius={4} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <h2 className="wallet-h2" aria-hidden="true">
        <Sk h={20} w={180} radius={5} />
      </h2>
      <ul className="wallet-history" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="wallet-row">
            <Sk className="wallet-row-cover" radius={8} />
            <div className="wallet-row-main">
              <Sk h={13} w={180} radius={4} />
              <Sk h={11} w={110} radius={4} style={{ marginTop: 7 }} />
            </div>
            <div className="wallet-row-meta">
              <Sk h={10} w={50} radius={4} />
              <Sk h={10} w={70} radius={4} style={{ marginTop: 5 }} />
            </div>
            <Sk h={12} w={56} radius={4} />
          </li>
        ))}
      </ul>
    </div>
  );
}
