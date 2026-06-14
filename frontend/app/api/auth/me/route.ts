// GET /api/auth/me — the current signed-in account + its profiles, or
// { account: null }. The account comes straight from the cookie; profiles need
// a DSQL read (skipped when DSQL isn't configured).
import { readSession, sessionConfigured } from "@/lib/server/session";
import { getProfiles } from "@/lib/server/accounts";
import { dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // authConfigured lets the client decide whether to gate playback at all: an
  // env without a session secret / DSQL shouldn't trap listeners behind a
  // sign-in that can't complete.
  const authConfigured = sessionConfigured() && dsqlConfigured();
  const session = authConfigured ? await readSession(request) : null;
  if (!session) return Response.json({ account: null, profiles: null, authConfigured });

  let profiles = null;
  try {
    profiles = await getProfiles(session.sub);
  } catch (err) {
    console.error("me: profiles read failed", err);
  }
  return Response.json({
    account: { id: session.sub, displayName: session.name },
    profiles,
    authConfigured,
  });
}
