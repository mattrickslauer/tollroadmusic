import { serverCatalogPublic } from "@/lib/api/server";
import { resolveCoverSrc } from "@/lib/coverSrc";
import { findArtist } from "@/lib/shareUrls";
import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og/shareCard";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "TollRoad artist";

export default async function ArtistOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const artist = catalog && findArtist(catalog, slug);
  const subtitle = artist
    ? [artist.genre, artist.location].filter(Boolean).join(" · ") || "Artist on TollRoad"
    : "Pay for the minutes you actually hear";
  return shareCard({
    eyebrow: "Artist",
    title: artist?.name ?? "TollRoad",
    subtitle,
    coverUrl: artist ? resolveCoverSrc(artist.avatarKey) : null,
    rounded: true,
  });
}
