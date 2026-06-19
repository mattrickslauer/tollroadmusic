"use client";

import { useLibrary } from "@/context/LibraryProvider";

/** A heart toggle wired to the shared library state. Used on cards, rows, and
 *  the player bar — the liked state stays consistent everywhere it appears. */
export default function LikeButton({ trackId, size = 18 }: { trackId: string; size?: number }) {
  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(trackId);
  return (
    <button
      className="lx-like"
      data-on={liked}
      onClick={(e) => { e.stopPropagation(); toggleLike(trackId); }}
      aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      aria-pressed={liked}
      title={liked ? "Liked" : "Like"}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
