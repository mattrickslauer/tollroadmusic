import { NextResponse } from 'next/server'
import { getSynapse } from '@/server/synapse'
import { decryptAes256GcmFromPayload } from '@/server/crypto'
import { getTrackByTrackId } from '@/server/db'

export const runtime = 'nodejs'

export async function GET(_req: Request, context: { params: { trackId: string } }) {
  try {
    const trackId = context.params.trackId
    if (!trackId) {
      return NextResponse.json({ error: 'missing trackId' }, { status: 400 })
    }
    const row = getTrackByTrackId(trackId)
    if (!row || !row.audio_cid) {
      return NextResponse.json({ error: 'track not found' }, { status: 404 })
    }
    const synapse = await getSynapse()
    const bytes = await (synapse as any).storage.download(row.audio_cid)
    const payload = Buffer.from(bytes)
    const audio = decryptAes256GcmFromPayload(payload)
    return new NextResponse(audio as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length.toString(),
        'Cache-Control': 'no-store'
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'stream failed' }, { status: 500 })
  }
}


