// Pure next-track selection for DJ sessions — no I/O, no side effects.
// All network calls (discovery, DynamoDB, stream signing) live in the handler.

/** Return the first candidate whose trackId is NOT in `played`, preserving
 *  the discovery-ranked order. Returns null when every candidate has been played. */
export function pickNext(
  candidates: { trackId: string; score: number }[],
  played: Set<string>,
): string | null {
  for (const c of candidates) {
    if (!played.has(c.trackId)) return c.trackId;
  }
  return null;
}
