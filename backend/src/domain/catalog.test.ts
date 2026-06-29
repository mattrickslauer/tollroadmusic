import { test } from "node:test";
import assert from "node:assert/strict";
import { dsqlConfigured, query } from "../lib/dsql.ts";
import { getCatalog } from "./catalog.ts";

test(
  "getCatalog hides soft-deleted and audio-less tracks",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `30000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const active = `30000001-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const inactive = `30000002-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const pending = `30000003-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    try {
      await query(`INSERT INTO artists (id, name) VALUES ($1, $2)`, [artistId, `CatTest ${suffix}`]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key, is_active)
           VALUES ($1,$2,'Active',120,1000,'audio/a.mp3',true)`, [active, artistId]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key, is_active)
           VALUES ($1,$2,'Inactive',120,1000,'audio/b.mp3',false)`, [inactive, artistId]);
      await query(
        `INSERT INTO tracks (id, artist_id, title, duration_seconds, price_per_minute_millicents, audio_key)
           VALUES ($1,$2,'Pending',120,1000,'')`, [pending, artistId]);

      const cat = await getCatalog();
      const ids = new Set(cat.tracks.map((t) => t.id));
      assert.equal(ids.has(active), true, "active track should appear");
      assert.equal(ids.has(inactive), false, "soft-deleted track must be hidden");
      assert.equal(ids.has(pending), false, "audio-less track must be hidden");
    } finally {
      await query(`DELETE FROM tracks WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM artists WHERE id = $1`, [artistId]).catch(() => {});
    }
  },
);
