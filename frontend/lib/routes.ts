/** Canonical destinations for every call-to-action on the site. */
export const ROUTES = {
  /** Listener path — browse the catalog and start a metered session. */
  browse: "/browse",
  /** Artist path — sign up to bring a catalog. */
  signup: "/signup",
} as const;

/** In-page section anchors used by the nav + footer for scroll navigation. */
export const SECTIONS = {
  top: "#top",
  flow: "#flow",
  outcomes: "#outcomes",
  start: "#start",
} as const;
