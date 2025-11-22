'use client'

export type Track = {
  id: string;
  title: string;
  durationSeconds: number;
  audioPath: string;
  albumId: string;
  artistName: string;
  coverPath: string;
};

export type Album = {
  id: string;
  title: string;
  artistName: string;
  coverPath: string;
  tracks: Track[];
};

export type Catalog = {
  albums: Album[];
  tracks: Track[];
};


