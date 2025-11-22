'use client'

import { Album, Catalog, Track } from "@/types/music";

function makeTrack(id: string, title: string, albumId: string, artistName: string, coverPath: string, audioPath: string, durationSeconds: number): Track {
  return {
    id,
    title,
    durationSeconds,
    audioPath,
    albumId,
    artistName,
    coverPath,
  };
}

function makeAlbum(id: string, title: string, artistName: string, coverPath: string, baseAudioPath: string): Album {
  const tracks = [
    makeTrack(`${id}-t1`, `${title} I`, id, artistName, coverPath, baseAudioPath, 210),
    makeTrack(`${id}-t2`, `${title} II`, id, artistName, coverPath, baseAudioPath, 198),
    makeTrack(`${id}-t3`, `${title} III`, id, artistName, coverPath, baseAudioPath, 245),
  ];
  return { id, title, artistName, coverPath, tracks };
}

export const catalog: Catalog = (function buildCatalog() {
  const loveVirusCover = "/music/love-virus/cover.png";
  const loveVirusAudio = "/music/love-virus/song.mp3";

  const a1 = makeAlbum("love-virus", "Love Virus", "Amanda Kurt", loveVirusCover, loveVirusAudio);
  const a2 = makeAlbum("midnight-drive", "Midnight Drive", "Neon Highway", loveVirusCover, loveVirusAudio);
  const a3 = makeAlbum("city-pop-dreams", "City Pop Dreams", "Aya Tanaka", loveVirusCover, loveVirusAudio);
  const a4 = makeAlbum("sunset-boulevard", "Sunset Boulevard", "The Del Mar", loveVirusCover, loveVirusAudio);

  const albums: Album[] = [a1, a2, a3, a4];
  const tracks: Track[] = albums.flatMap(function flatten(album) {
    return album.tracks;
  });
  return { albums, tracks };
})();


