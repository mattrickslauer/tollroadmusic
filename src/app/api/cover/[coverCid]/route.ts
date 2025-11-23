import { NextResponse } from 'next/server'
import { getSynapse } from '@/server/synapse'

export const runtime = 'nodejs'

export async function GET(_req: Request, context: { params: Promise<{ coverCid: string }> }) {
  try {
    const { coverCid } = await context.params
    if (!coverCid) {
      return NextResponse.json({ error: 'missing coverCid' }, { status: 400 })
    }
    const synapse = await getSynapse()
    const bytes = await (synapse as any).storage.download(coverCid)
    const payload = Buffer.from(bytes)
    return new NextResponse(payload as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': payload.length.toString(),
        'Cache-Control': 'no-store'
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'cover download failed' }, { status: 500 })
  }
}


