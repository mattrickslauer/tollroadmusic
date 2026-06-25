import { notFound } from "next/navigation";
import ArtistProfileView from "@/components/listen/ArtistProfileView";
import { serverArtistProfile, serverCatalog, apiConfigured } from "@/lib/api/server";
import { slugify, isUuid } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!apiConfigured()) return <p className="lx-empty">Not configured.</p>;

  let profile = null;
  if (isUuid(slug)) {
    // Legacy/UUID links still resolve directly.
    profile = await serverArtistProfile(slug);
  } else {
    // Resolve the slug to an artist by matching slugify(name) against the catalog.
    const catalog = await serverCatalog();
    const artist = catalog.artists.find((a) => slugify(a.name) === slug);
    if (artist) profile = await serverArtistProfile(artist.id);
  }
  if (!profile) notFound();
  return <ArtistProfileView profile={profile} />;
}
