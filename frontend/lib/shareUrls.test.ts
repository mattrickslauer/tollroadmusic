import { test } from "node:test";
import assert from "node:assert/strict";
import { songPath, artistPath, absoluteUrl, parseSongSlug, findTrack, findArtist, shareTargets } from "./shareUrls.ts";

const track = (id: string, title: string, artistId = "ar", artistName = "Some One") => ({
  id, title, artistId, artistName,
  genre: null, durationSeconds: 200, pricePerMinuteMillicents: 1000, coverImageKey: null,
});
const artist = (id: string, name: string) => ({
  id, name, genre: null, location: null, bio: null, avatarKey: null,
  payoutsEnabled: true, trackCount: 1, minutes: 0, earningsMillicents: 0,
});

test("songPath: readable slug + 8-char short id", () => {
  assert.equal(songPath(track("a1b2c3d4-0000-0000-0000-000000000000", "Midnight Drive")), "/s/midnight-drive--a1b2c3d4");
});
test("songPath: symbol-only title falls back to 'song'", () => {
  assert.match(songPath(track("ffffffff-0000-0000-0000-000000000000", "!!!")), /^\/s\/song--ffffffff$/);
});
test("artistPath: slugified name; falls back to id when name is empty", () => {
  assert.equal(artistPath(artist("ar1", "Adhesion & Scrap Heap")), "/a/adhesion-scrap-heap");
  assert.equal(artistPath(artist("ar2", "")), "/a/ar2");
});
test("absoluteUrl: prefixes the site origin and a leading slash", () => {
  assert.equal(absoluteUrl("/s/x--1"), "https://www.tollroadmusic.xyz/s/x--1");
  assert.equal(absoluteUrl("s/x--1"), "https://www.tollroadmusic.xyz/s/x--1");
});
test("parseSongSlug: trailing id after the last '--'; bare uuid passes through", () => {
  assert.equal(parseSongSlug("midnight-drive--a1b2c3d4").id, "a1b2c3d4");
  assert.equal(parseSongSlug("a1b2c3d4-0000-0000-0000-000000000000").id, "a1b2c3d40000000000000000000000000".slice(0, 32));
});

const catalog = {
  artists: [artist("ar1", "Adhesion & Scrap Heap"), artist("ar2", "Lo Fi Cat")],
  tracks: [
    track("a1b2c3d4-1111-1111-1111-111111111111", "Drive", "ar1", "Adhesion & Scrap Heap"),
    track("e5f6a7b8-2222-2222-2222-222222222222", "Drive", "ar2", "Lo Fi Cat"), // same title, different id
  ],
  stats: { artists: 2, tracks: 2, minutes: 0, earningsMillicents: 0 },
};

test("findTrack: same-titled songs resolve to distinct tracks by short id", () => {
  assert.equal(findTrack(catalog, songPath(catalog.tracks[0]))?.id, catalog.tracks[0].id);
  assert.equal(findTrack(catalog, songPath(catalog.tracks[1]))?.id, catalog.tracks[1].id);
});
test("findTrack: bare full UUID resolves (legacy)", () => {
  assert.equal(findTrack(catalog, "a1b2c3d4-1111-1111-1111-111111111111")?.id, catalog.tracks[0].id);
});
test("findTrack: unknown id -> null", () => {
  assert.equal(findTrack(catalog, "nope--00000000"), null);
});
test("findArtist: by slug and by bare id; unknown -> null", () => {
  assert.equal(findArtist(catalog, "adhesion-scrap-heap")?.id, "ar1");
  assert.equal(findArtist(catalog, "ar2")?.id, "ar2");
  assert.equal(findArtist(catalog, "ghost"), null);
});

test("shareTargets: covers the expected channels", () => {
  const keys = shareTargets("https://www.tollroadmusic.xyz/s/x--1", "Drive — Lo Fi Cat").map((t) => t.key);
  assert.deepEqual(keys, ["sms", "whatsapp", "telegram", "x", "facebook", "email"]);
});
test("shareTargets: url and title are encoded into every href", () => {
  const url = "https://www.tollroadmusic.xyz/s/midnight-drive--a1b2c3d4";
  const ts = shareTargets(url, "Midnight Drive & Co");
  const enc = encodeURIComponent(url);
  // every link must carry the encoded absolute url (so the shared link works)
  for (const t of ts) assert.ok(t.href.includes(enc) || t.href.includes(encodeURIComponent(`Midnight Drive & Co ${url}`)), `${t.key} missing url`);
  // the "&" in the title must be percent-encoded, never left raw to break params
  const x = ts.find((t) => t.key === "x")!;
  assert.ok(x.href.includes("Midnight%20Drive%20%26%20Co"));
  assert.ok(!x.href.includes("Drive & Co"));
});
test("shareTargets: sms and mailto use protocol handlers", () => {
  const ts = shareTargets("https://t.m/s/x--1", "T");
  assert.ok(ts.find((t) => t.key === "sms")!.href.startsWith("sms:"));
  assert.ok(ts.find((t) => t.key === "email")!.href.startsWith("mailto:"));
});
