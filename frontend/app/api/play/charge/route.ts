// POST /api/play/charge  { trackId }
// Bill one metered minute of a track against the signed-in listener's prepaid
// balance. Called by the meter at play start and on each new minute of real
// playback. Idempotent per wall-clock minute (see chargeMinute). Returns the new
// balance, or 402 when the balance can't cover the minute → the client pauses
// and opens the top-up sheet.
import { readSession, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";
import { getTrackBilling } from "@/lib/server/tracks";
import { chargeMinute } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sessionConfigured() || !dsqlConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  const session = await readSession(request);
  if (!session) return Response.json({ error: "sign in to listen" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const trackId = typeof body?.trackId === "string" ? body.trackId : "";
  if (!trackId) return Response.json({ error: "trackId required" }, { status: 400 });

  const track = await getTrackBilling(trackId);
  if (!track) return Response.json({ error: "no such track" }, { status: 404 });

  const result = await chargeMinute({
    accountId: session.sub,
    trackId: track.id,
    artistId: track.artistId,
    amountCents: track.pricePerMinuteCents,
  });

  if (!result.ok) {
    return Response.json(
      { error: "insufficient balance", balanceCents: result.balanceCents },
      { status: 402 },
    );
  }
  return Response.json({ balanceCents: result.balanceCents, charged: result.charged });
}
