import { notFound } from "next/navigation";
import ArtistProfileView from "@/components/listen/ArtistProfileView";
import { serverArtistProfile, apiConfigured } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!apiConfigured()) return <p className="lx-empty">Not configured.</p>;
  const profile = await serverArtistProfile(id);
  if (!profile) notFound();
  return <ArtistProfileView profile={profile} />;
}
