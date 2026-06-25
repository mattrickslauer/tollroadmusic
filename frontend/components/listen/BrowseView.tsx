"use client";

import { useMemo, useState } from "react";
import type { Catalog } from "@/lib/api/types";
import BondRail from "@/components/bond/BondRail";
import RecentlyPlayedRail from "./RecentlyPlayedRail";
import CatalogFilters from "./CatalogFilters";
import TrackGrid from "./TrackGrid";

/** The /browse experience: recently-played rail + filterable catalog grid.
 *  Playback is dispatched into the global PlayerProvider, so audio + the meter
 *  persist when the listener navigates away. */
export default function BrowseView({ data }: { data: Catalog }) {
  const { tracks } = data;
  const [genre, setGenre] = useState("All");
  const [q, setQ] = useState("");

  const genres = useMemo(
    () => ["All", ...Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean) as string[])).sort()],
    [tracks],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tracks.filter(
      (t) =>
        (genre === "All" || t.genre === genre) &&
        (!needle || t.title.toLowerCase().includes(needle) || t.artistName.toLowerCase().includes(needle)),
    );
  }, [tracks, genre, q]);

  return (
    <>
      <BondRail />
      <RecentlyPlayedRail />
      <CatalogFilters genres={genres} genre={genre} onGenre={setGenre} q={q} onQuery={setQ} />
      <TrackGrid tracks={visible} />
    </>
  );
}
