import { NextResponse } from 'next/server'
import { getCatalogFromDb } from '@/server/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    console.log('catalog:start')
    const catalog = getCatalogFromDb()
    console.log('catalog:done', { albums: catalog.albums.length, tracks: catalog.tracks.length })
    return NextResponse.json(catalog)
  } catch (e: any) {
    console.error('catalog:error', e?.message || '')
    if (e && e.stack) console.error('catalog:stack', e.stack)
    return NextResponse.json({ albums: [], tracks: [], error: e?.message || 'failed to load catalog' }, { status: 500 })
  }
}



