// GET /api/stream/[trackId] — the ONLY path that decrypts audio.
//
// Gate: a valid session AND a royalty_ledger row for (user, track) from the last
// couple of minutes — i.e. the meter has already billed this play. No session →
// 401; no recent charge → 402 (and not a single byte is decrypted). Only once
// both hold do we decrypt the at-rest file and stream it, with Range support so
// the <audio> element can seek.
import { readSession, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";
import { getTrackBilling } from "@/lib/server/tracks";
import { hasRecentCharge } from "@/lib/server/billing";
import { loadAudio } from "@/lib/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  if (!sessionConfigured() || !dsqlConfigured()) {
    return new Response("streaming not configured", { status: 503 });
  }
  const session = await readSession(request);
  if (!session) return new Response("sign in to listen", { status: 401 });

  const { trackId } = await params;
  const track = await getTrackBilling(trackId);
  if (!track) return new Response("no such track", { status: 404 });

  // Proof of payment — the meter must have billed this play already.
  if (!(await hasRecentCharge(session.sub, trackId))) {
    return new Response("payment required", {
      status: 402,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let audio;
  try {
    audio = await loadAudio(track.audioKey);
  } catch (err) {
    console.error("stream: audio load failed", err);
    return new Response("audio unavailable", { status: 500 });
  }

  const total = audio.data.length;
  const baseHeaders: Record<string, string> = {
    "Content-Type": audio.contentType,
    "Accept-Ranges": "bytes",
    // Decrypted audio is per-listener and paid-for — never cache it anywhere.
    "Cache-Control": "no-store, private",
  };

  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return new Response("range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}`, ...baseHeaders },
        });
      }
      const chunk = audio.data.subarray(start, end + 1);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(chunk.length),
        },
      });
    }
  }

  return new Response(new Uint8Array(audio.data), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}
