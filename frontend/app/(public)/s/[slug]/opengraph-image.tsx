import { serverCatalogPublic } from "@/lib/api/server";
import { resolveCoverSrc } from "@/lib/coverSrc";
import { findTrack } from "@/lib/shareUrls";
import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og/shareCard";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "TollRoad song";

export default async function SongOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const track = catalog && findTrack(catalog, slug);
  return shareCard({
    eyebrow: "Song",
    title: track?.title ?? "TollRoad",
    subtitle: track ? `by ${track.artistName}` : "Pay for the minutes you actually hear",
    badge: track ? `${track.pricePerMinuteCents}¢/min` : undefined,
    coverUrl: track ? resolveCoverSrc(track.coverImageKey) : null,
  });
}
