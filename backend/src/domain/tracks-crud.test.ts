import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTitle,
  isValidDuration,
  extForAudioContentType,
  buildAudioKey,
} from "./tracks-crud.ts";

test("isValidTitle accepts non-empty short strings, rejects empty/long/non-string", () => {
  assert.equal(isValidTitle("Midnight Drive"), true);
  assert.equal(isValidTitle("  "), false);
  assert.equal(isValidTitle(""), false);
  assert.equal(isValidTitle("x".repeat(201)), false);
  assert.equal(isValidTitle(123), false);
});

test("isValidDuration accepts 1..36000 integers only", () => {
  assert.equal(isValidDuration(1), true);
  assert.equal(isValidDuration(210), true);
  assert.equal(isValidDuration(36000), true);
  assert.equal(isValidDuration(0), false);
  assert.equal(isValidDuration(36001), false);
  assert.equal(isValidDuration(12.5), false);
  assert.equal(isValidDuration("210"), false);
});

test("extForAudioContentType maps supported audio types only", () => {
  assert.equal(extForAudioContentType("audio/mpeg"), "mp3");
  assert.equal(extForAudioContentType("audio/mp4"), "m4a");
  assert.equal(extForAudioContentType("audio/wav"), "wav");
  assert.equal(extForAudioContentType("audio/flac"), "flac");
  assert.equal(extForAudioContentType("audio/aac"), "aac");
  assert.equal(extForAudioContentType("image/png"), null);
});

test("buildAudioKey is audio-prefixed and deterministic in shape", () => {
  assert.equal(buildAudioKey("t1", "mp3", "abcd"), "audio/t1-abcd.mp3");
});

import { dsqlConfigured, query } from "../lib/dsql.ts";
import {
  createTrack,
  setTrackAudio,
  updateTrack,
  softDeleteTrack,
} from "./tracks-crud.ts";

test(
  "createTrack → setTrackAudio → updateTrack → softDeleteTrack lifecycle",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `20000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    let trackId = "";
    try {
      const created = await createTrack({
        artistId,
        title: "Test Song",
        durationSeconds: 200,
        pricePerMinuteMillicents: 1000,
      });
      trackId = created.id;
      const row1 = await query<{ audio_key: string; is_active: boolean | null; title: string }>(
        `SELECT audio_key, is_active, title FROM tracks WHERE id = $1`,
        [trackId],
      );
      assert.equal(row1.rows[0]!.audio_key, ""); // placeholder until committed
      assert.equal(row1.rows[0]!.is_active, null); // NULL ⇒ active
      assert.equal(row1.rows[0]!.title, "Test Song");

      assert.equal(await setTrackAudio(artistId, trackId, "audio/x.mp3"), true);
      // Wrong artist cannot set audio.
      assert.equal(await setTrackAudio("99999999-0000-4000-8000-999999999999", trackId, "audio/y.mp3"), false);

      assert.equal(await updateTrack(artistId, trackId, { title: "Renamed", pricePerMinuteMillicents: 2000 }), true);
      const row2 = await query<{ title: string; price_per_minute_millicents: number; audio_key: string }>(
        `SELECT title, price_per_minute_millicents, audio_key FROM tracks WHERE id = $1`,
        [trackId],
      );
      assert.equal(row2.rows[0]!.title, "Renamed");
      assert.equal(row2.rows[0]!.price_per_minute_millicents, 2000);
      assert.equal(row2.rows[0]!.audio_key, "audio/x.mp3"); // unchanged by update

      assert.equal(await softDeleteTrack(artistId, trackId), true);
      const row3 = await query<{ is_active: boolean }>(`SELECT is_active FROM tracks WHERE id = $1`, [trackId]);
      assert.equal(row3.rows[0]!.is_active, false);
    } finally {
      if (trackId) await query(`DELETE FROM tracks WHERE id = $1`, [trackId]).catch(() => {});
    }
  },
);
