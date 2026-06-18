// Streaming — the x402 GATE.
//
// GET /v1/stream/{trackId}        -> 402 (x402) if no recent paid minute, else a
//                                    StreamGrant: a signed CloudFront URL (prod)
//                                    or a proxy URL (local dev).
// GET /v1/stream/{trackId}/raw    -> the actual bytes, Range-aware, re-checking
//                                    payment. Used only in proxy (no-CDN) mode.
import { type Handler, ok, error, requireSession, header, NO_STORE } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { getTrackBilling } from "../domain/tracks.ts";
import { hasRecentCharge } from "../domain/billing.ts";
import { signedStreamUrl, GRANT_TTL_SECONDS } from "../domain/streaming.ts";
import { loadAudio } from "../domain/media.ts";

const API_BASE = process.env.TOLLROAD_API_BASE ?? ""; // e.g. https://api…/v1 ; "" => relative

export const streamGrant: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "streaming not configured");
  const session = await requireSession(req);
  const trackId = req.params.trackId;
  if (!trackId) return error(400, "trackId required");

  const track = await getTrackBilling(trackId);
  if (!track) return error(404, "no such track");

  // Proof of payment — the meter must have billed this play already.
  if (!(await hasRecentCharge(session.sub, trackId))) {
    const { paymentRequired } = await import("../lib/x402.ts");
    return paymentRequired({
      resource: `/v1/stream/${trackId}`,
      trackId,
      pricePerMinuteCents: track.pricePerMinuteCents,
    });
  }

  const signed = signedStreamUrl(track.audioKey);
  if (signed) return ok(signed, NO_STORE);

  // No CDN configured → hand back the proxy URL (local dev).
  return ok(
    {
      url: `${API_BASE}/stream/${trackId}/raw`,
      expiresAt: Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS,
      mode: "proxy",
    },
    NO_STORE,
  );
};

export const streamRaw: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "streaming not configured");
  const session = await requireSession(req);
  const trackId = req.params.trackId;
  if (!trackId) return error(400, "trackId required");

  const track = await getTrackBilling(trackId);
  if (!track) return error(404, "no such track");
  if (!(await hasRecentCharge(session.sub, trackId))) {
    return { status: 402, raw: { contentType: "text/plain", data: "payment required" }, headers: { "Cache-Control": "no-store" } };
  }

  let audio;
  try {
    audio = await loadAudio(track.audioKey);
  } catch (err) {
    console.error("stream: audio load failed", err);
    return error(500, "audio unavailable");
  }

  const total = audio.data.length;
  const base: Record<string, string> = {
    "Content-Type": audio.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store, private",
  };

  const range = header(req, "range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return { status: 416, raw: { contentType: audio.contentType, data: "" }, headers: { ...base, "Content-Range": `bytes */${total}` } };
      }
      const chunk = audio.data.subarray(start, end + 1);
      return {
        status: 206,
        raw: { contentType: audio.contentType, data: chunk },
        headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.length) },
      };
    }
  }

  return {
    status: 200,
    raw: { contentType: audio.contentType, data: audio.data },
    headers: { ...base, "Content-Length": String(total) },
  };
};
