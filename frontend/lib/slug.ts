// Artist URL slugs are derived from the artist's name so links read as
// /artists/adhesion-scrap-heap instead of a UUID. The artist page resolves a
// slug back to an artist by matching slugify(name); UUIDs are still accepted
// for backward-compatible/legacy links.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** "Adhesion & Scrap Heap" -> "adhesion-scrap-heap". Stable, ASCII, url-safe. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip accents (café -> cafe)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics -> single dash
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
}
