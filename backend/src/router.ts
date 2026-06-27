// The single route table for the TollRoad API. Maps METHOD + path (relative to
// the /v1 stage) to a handler. Used by both the API Gateway Lambda entry
// (src/lambda.ts) and the local dev server (src/local-server.ts), so the contract
// is identical everywhere.
import { type ApiRequest, type ApiResponse, type Handler, error, HttpError } from "./lib/http.ts";
import * as auth from "./handlers/auth.ts";
import * as catalog from "./handlers/catalog.ts";
import { charge } from "./handlers/charge.ts";
import { streamGrant, streamRaw } from "./handlers/stream.ts";
import * as wallet from "./handlers/wallet.ts";
import { webhook } from "./handlers/stripe-webhook.ts";
import * as library from "./handlers/library.ts";
import { summary as artistSummary, create as artistCreate } from "./handlers/artist.ts";
import * as artistContent from "./handlers/artist-content.ts";
import * as superfan from "./handlers/superfan.ts";
import { discover } from "./handlers/discover.ts";
import { startSession, nextTrack } from "./handlers/sessions.ts";

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(method: string, pattern: string, handler: Handler): Route {
  const keys: string[] = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/\{(\w+)\}/g, (_m, k: string) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "/?$",
  );
  return { method, regex, keys, handler };
}

const ROUTES: Route[] = [
  compile("POST", "/auth/otp/start", auth.otpStart),
  compile("POST", "/auth/otp/verify", auth.otpVerify),
  compile("GET", "/auth/me", auth.me),
  compile("POST", "/auth/logout", auth.logout),

  compile("POST", "/discover", discover),

  compile("POST", "/sessions", startSession),
  compile("POST", "/sessions/{id}/next", nextTrack),

  compile("GET", "/catalog", catalog.catalog),
  compile("GET", "/tracks/{trackId}", catalog.track),
  compile("GET", "/artists", catalog.artists),
  compile("GET", "/artists/{id}", catalog.artistById),
  compile("POST", "/artists", artistCreate),

  compile("POST", "/charge", charge),
  compile("GET", "/stream/{trackId}", streamGrant),
  compile("GET", "/stream/{trackId}/raw", streamRaw),

  compile("GET", "/balance", wallet.balance),
  compile("POST", "/wallet/topup", wallet.topup),
  compile("POST", "/wallet/demo-credit", wallet.demoCredit),
  compile("POST", "/wallet/onboarding-gift", wallet.onboardingGift),
  compile("POST", "/wallet/confirm", wallet.confirm),
  compile("POST", "/stripe/webhook", webhook),

  compile("GET", "/library/likes", library.getLikes),
  compile("POST", "/library/likes", library.postLike),
  compile("DELETE", "/library/likes", library.deleteLike),
  compile("GET", "/playlists", library.getPlaylists),
  compile("POST", "/playlists", library.postPlaylist),
  compile("GET", "/playlists/{playlistId}", library.getPlaylist),
  compile("GET", "/playlists/{playlistId}/public", library.getPublicPlaylist),
  compile("POST", "/playlists/{playlistId}/visibility", library.postPlaylistVisibility),
  compile("DELETE", "/playlists/{playlistId}", library.deletePlaylist),
  compile("POST", "/playlists/{playlistId}/tracks", library.addPlaylistTrack),
  compile("DELETE", "/playlists/{playlistId}/tracks", library.removePlaylistTrack),
  compile("GET", "/recents", library.getRecents),
  compile("POST", "/recents", library.postRecent),

  compile("GET", "/artist/summary", artistSummary),

  compile("POST", "/artist/avatar/presign", artistContent.avatarPresign),
  compile("POST", "/artist/avatar/commit", artistContent.avatarCommit),
  compile("POST", "/artist/cover/presign", artistContent.coverPresign),
  compile("POST", "/artist/cover/commit", artistContent.coverCommit),
  compile("POST", "/artist/track/rate", artistContent.rateUpdate),
  compile("POST", "/artist/profile", artistContent.profileUpdate),

  compile("GET", "/superfan/bond/{artistId}", superfan.bond),
  compile("GET", "/superfan/leaderboard/{artistId}", superfan.leaderboard),
  compile("GET", "/superfan/my-bonds", superfan.myBonds),
  compile("GET", "/superfan/profile/{handle}", superfan.profile),
];

export interface Match {
  handler: Handler;
  params: Record<string, string>;
}

/** Find the handler + path params for a method/path (path already stripped of
 *  the /v1 prefix). Returns null if nothing matches. */
export function match(method: string, path: string): Match | null {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.regex.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1] ?? "");
    });
    return { handler: r.handler, params };
  }
  return null;
}

/** Dispatch a fully-formed ApiRequest through the matched handler, mapping
 *  thrown HttpErrors (and unexpected errors) to responses. */
export async function dispatch(req: ApiRequest, path: string): Promise<ApiResponse> {
  const found = match(req.method, path);
  if (!found) return error(404, "not found");
  req.params = { ...found.params, ...req.params };
  try {
    return await found.handler(req);
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    console.error(`handler error on ${req.method} ${path}`, err);
    return error(500, "internal error");
  }
}
