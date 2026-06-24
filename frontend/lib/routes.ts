/** Canonical destinations for every call-to-action on the site. */
export const ROUTES = {
  /** Listener path — browse the catalog and start a metered session. */
  browse: "/browse",
  /** Listener library + wallet (the dark (listen) app). */
  library: "/library",
  liked: "/liked",
  wallet: "/wallet",
  /** Artist path — sign up to bring a catalog, then the royalty dashboard. */
  signup: "/artist/join",
  artist: "/artist",
  /** Public artist profile page. */
  artistProfile: (id: string) => `/artists/${encodeURIComponent(id)}`,
} as const;

/** In-page section anchors used by the nav + footer for scroll navigation. */
export const SECTIONS = {
  top: "#top",
  flow: "#flow",
  outcomes: "#outcomes",
  start: "#start",
} as const;
