"use client";

import { useMemo, useState } from "react";
import type { Catalog } from "@/lib/api/types";
import CatalogFilters from "./CatalogFilters";
import TrackGrid from "./TrackGrid";

/** /search — the same catalog, filter-first. Starts empty until the listener
 *  types or picks a genre, so it reads as a search surface rather than a grid. */
export default function SearchView({ data }: { data: Catalog }) {
  const { tracks } = data;
  const [genre, setGenre] = useState("All");
  const [q, setQ] = useState("");

  const genres = useMemo(
    () => ["All", ...Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean) as string[])).sort()],
    [tracks],
  );

  const active = q.trim() !== "" || genre !== "All";
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
      <CatalogFilters genres={genres} genre={genre} onGenre={setGenre} q={q} onQuery={setQ} />
      {active ? (
        <TrackGrid tracks={visible} />
      ) : (
        <p className="lx-empty">Search by track or artist, or pick a genre to browse.</p>
      )}
    </>
  );
}
