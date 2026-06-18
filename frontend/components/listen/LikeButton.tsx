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
          d="M12 21s-7.5-4.6-10-9.2C.6 9.2 1.6 5.5 5 4.6c2-.5 3.8.5 5 2 .9-1.4 2.8-2.5 4.8-2 3.4.9 4.4 4.6 3 7.2C19.5 16.4 12 21 12 21z"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    </button>
  );
}
