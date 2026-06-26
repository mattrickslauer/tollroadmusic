import type { MetadataRoute } from "next";
import { serverCatalogPublic } from "@/lib/api/server";
import { absoluteUrl, artistPath, songPath } from "@/lib/shareUrls";

export const revalidate = 3600;

/** Lists the public, indexable surface — the marketing home plus every artist
 *  and song share page — so search engines can discover them. The in-app
 *  listener routes (/browse, /library, …) are intentionally excluded; they're
 *  the gated app, covered by robots.ts disallows. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await serverCatalogPublic();
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
  ];
  if (!catalog) return entries;

  for (const artist of catalog.artists) {
    entries.push({ url: absoluteUrl(artistPath(artist)), changeFrequency: "weekly", priority: 0.7 });
  }
  for (const track of catalog.tracks) {
    entries.push({ url: absoluteUrl(songPath(track)), changeFrequency: "monthly", priority: 0.6 });
  }
  return entries;
}
