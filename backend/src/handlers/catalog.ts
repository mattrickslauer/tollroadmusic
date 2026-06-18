// Catalog reads. Available to signed-in users and to usage-plan API keys
// (programmatic consumers / agents browsing the catalog before they pay).
import { type Handler, ok, error } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { getCatalog } from "../domain/catalog.ts";
import { getTrackBilling } from "../domain/tracks.ts";

export const catalog: Handler = async () => {
  if (!dsqlConfigured()) return error(503, "catalog not configured");
  return ok(await getCatalog());
};

export const track: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "catalog not configured");
  const id = req.params.trackId;
  if (!id) return error(400, "trackId required");
  const t = await getTrackBilling(id);
  if (!t) return error(404, "no such track");
  return ok(t);
};

export const artists: Handler = async () => {
  if (!dsqlConfigured()) return error(503, "catalog not configured");
  const { artists } = await getCatalog();
  return ok({ artists });
};
