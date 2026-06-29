"use client";

import type { RepeatMode } from "@/context/PlayerProvider";

const LABEL: Record<RepeatMode, string> = {
  off: "Repeat off — tap to repeat queue",
  all: "Repeating queue — tap to repeat one",
  one: "Repeating this track — tap to turn off",
};

/** The repeat control shared by the mini bar and the full-screen player. One
 *  button cycling off → repeat-all → repeat-one; active modes glow accent and
 *  repeat-one shows the "1" badge variant of the icon. */
export default function RepeatButton({ mode, onClick, disabled }: { mode: RepeatMode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="lx-pctrl"
      onClick={onClick}
      disabled={disabled}
      data-active={mode !== "off"}
      aria-label={LABEL[mode]}
      title={LABEL[mode]}
    >
      {mode === "one" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
        </svg>
      )}
    </button>
  );
}
