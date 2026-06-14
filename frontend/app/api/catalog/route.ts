// GET /api/catalog — the public catalog (artists + tracks + headline stats)
// as JSON. Same read model the /browse page renders. Read-only; safe to cache
// briefly at the edge.

import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dsqlConfigured()) {
    return NextResponse.json(
      { error: "Catalog is not configured yet (TOLLROAD_DSQL_ENDPOINT missing)." },
      { status: 503 },
    );
  }
  try {
    const catalog = await getCatalog();
    return NextResponse.json(catalog, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("catalog read failed:", err);
    return NextResponse.json({ error: "Could not load the catalog." }, { status: 500 });
  }
}
