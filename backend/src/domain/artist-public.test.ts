import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPublicArtist, mapArtistTracks } from "./artist-public.ts";

test("mapPublicArtist exposes only public fields", () => {
  const row = {
    id: "a1", name: "Nova", genre: "Synthwave", location: "LA",
    bio: "hi", website: "https://nova.fm", avatar_key: "artist-avatars/a1.jpg",
    email: "secret@x.com", stripe_account_id: "acct_x", account_id: "u1",
  };
  const out = mapPublicArtist(row, 3);
  assert.deepEqual(out, {
    id: "a1", name: "Nova", genre: "Synthwave", location: "LA",
    bio: "hi", website: "https://nova.fm", avatarKey: "artist-avatars/a1.jpg",
    trackCount: 3,
  });
  assert.equal((out as Record<string, unknown>).email, undefined);
  assert.equal((out as Record<string, unknown>).stripeAccountId, undefined);
});

test("mapArtistTracks maps snake_case to CatalogTrack camelCase", () => {
  const rows = [{
    id: "t1", title: "Drift", artist_id: "a1", artist_name: "Nova",
    genre: "Synthwave", duration_seconds: 180, price_per_minute_cents: 1,
    cover_image_key: "track-covers/t1.jpg",
  }];
  const out = mapArtistTracks(rows);
  assert.equal(out[0].artistId, "a1");
  assert.equal(out[0].durationSeconds, 180);
  assert.equal(out[0].coverImageKey, "track-covers/t1.jpg");
});
