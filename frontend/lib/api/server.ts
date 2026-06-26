// Server-side API access for Server Components. Calls the backend directly
// (server→server, no CORS), forwarding the session cookie as a bearer token and
// attaching the app's usage-plan key. The front-end server layer holds no DB
// access — it's a thin client of the backend, same as the browser.
import { cookies } from "next/headers";
import type { ArtistProfile, ArtistSummary, Catalog, HistoryRow } from "./types";

const BACKEND = (process.env.TOLLROAD_API_BASE ?? "http://localhost:8787/v1").replace(/\/$/, "");
const APP_KEY = process.env.TOLLROAD_APP_API_KEY;
const SESSION_COOKIE = "tollroad_session";

export function apiConfigured(): boolean {
  return Boolean(process.env.TOLLROAD_API_BASE);
}

async function serverGet<T>(path: string, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (APP_KEY) headers["x-api-key"] = APP_KEY;
  if (opts.auth) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) headers["authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BACKEND}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`backend ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const serverCatalog = () => serverGet<Catalog>("/catalog");

/** Catalog for the public share pages. Unlike serverCatalog (no-store, for the
 *  live app), this caches with ISR so crawlers and link unfurlers get fast,
 *  shared HTML and we don't hammer the backend on every bot hit. Revalidates
 *  hourly. Returns null if the backend is unreachable / not configured so pages
 *  can 404 cleanly instead of throwing a 500 at a crawler. */
export async function serverCatalogPublic(revalidate = 3600): Promise<Catalog | null> {
  if (!apiConfigured()) return null;
  const headers: Record<string, string> = {};
  if (APP_KEY) headers["x-api-key"] = APP_KEY;
  try {
    const res = await fetch(`${BACKEND}/catalog`, { headers, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as Catalog;
  } catch {
    return null;
  }
}

/** Public artist profile (GET /artists/:id). Returns null when the artist is
 *  not found (404); throws for other non-OK responses. */
export async function serverArtistProfile(id: string): Promise<ArtistProfile | null> {
  const path = `/artists/${encodeURIComponent(id)}`;
  const headers: Record<string, string> = {};
  if (APP_KEY) headers["x-api-key"] = APP_KEY;
  const res = await fetch(`${BACKEND}${path}`, { headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend ${path} -> ${res.status}`);
  return (await res.json()) as ArtistProfile;
}
export const serverBalance = () => serverGet<{ balanceMillicents: number; history: HistoryRow[] }>("/balance", { auth: true });

/** The signed-in artist's royalty summary, or null if the account has no artist
 *  profile / the backend can't serve it (so the page can prompt to join). */
export async function serverArtistSummary(): Promise<ArtistSummary | null> {
  try {
    return await serverGet<ArtistSummary>("/artist/summary", { auth: true });
  } catch {
    return null;
  }
}

/** Whether a (verified) session cookie is present — for SSR gating. */
export async function hasSessionCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(SESSION_COOKIE)?.value);
}
