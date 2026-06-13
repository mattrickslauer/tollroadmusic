/* Minimal stroke icons — currentColor, 24x24 grid. */
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconYou = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
  </svg>
);

/* stacked pool — the middleman */
export const IconPool = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <ellipse cx="12" cy="6" rx="7" ry="2.6" />
    <path d="M5 6v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
    <path d="M5 11v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" />
  </svg>
);

export const IconArtist = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <circle cx="8" cy="17" r="3" />
    <path d="M11 17V5l8-2v10" />
    <circle cx="16" cy="15" r="3" />
  </svg>
);

export const IconWallet = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 9h18" />
    <circle cx="16.5" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const IconMeter = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M4 14a8 8 0 0 1 16 0" />
    <path d="M12 14l4-3" />
    <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconLedger = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);
