import { NextResponse } from 'next/server'
import { decodePayment } from 'x402/schemes'
import { verify, settle } from 'x402/verify'
import { getSynapse } from '@/server/synapse'
import { decryptAes256GcmFromPayload } from '@/server/crypto'
import { getTrackByTrackId } from '@/server/db'

export const runtime = 'nodejs'

function toAtomicUsdcFromCents(cents: number) {
  const base = BigInt(10000)
  const v = BigInt(cents > 0 ? cents : 1)
  return (v * base).toString()
}

function buildPaymentRequirements(req: Request, trackId: string, artistWallet: string, pricePerMinuteCents: number) {
  const url = new URL(req.url)
  const network = 'base-sepolia' as const
  const asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  const upfrontCents = pricePerMinuteCents > 0 ? pricePerMinuteCents : 1
  // The `extra` fields must match what the client uses when signing the EIP‑3009 permit.
  // If they differ (e.g. undefined vs "USDC"/"2"), the facilitator will report
  // `invalid_exact_evm_payload_signature`.
  const extra = {
    name: 'USDC',
    version: '2',
  }
  return {
    scheme: 'exact' as const,
    network,
    maxAmountRequired: toAtomicUsdcFromCents(upfrontCents),
    resource: url.toString(),
    description: 'Stream track ' + String(trackId),
    mimeType: 'audio/mpeg',
    payTo: artistWallet,
    maxTimeoutSeconds: 600,
    asset,
    extra,
  }
}

export async function GET(req: Request, context: { params: Promise<{ trackId: string }> }) {
  try {
    const { trackId } = await context.params
    console.log('[stream] GET', { trackId })
    if (!trackId) {
      return NextResponse.json({ error: 'missing trackId' }, { status: 400 })
    }
    const row = getTrackByTrackId(trackId)
    console.log('[stream] row', row)
    if (!row || !row.audio_cid) {
      return NextResponse.json({ error: 'track not found' }, { status: 404 })
    }
    const artistWallet = typeof row.artist_wallet === 'string' && row.artist_wallet.length > 0 ? String(row.artist_wallet) : ''
    if (!artistWallet) {
      console.error('[stream] missing artist wallet', { trackId })
      return NextResponse.json({ error: 'artist wallet missing' }, { status: 500 })
    }
    const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(artistWallet)
    if (!isEvmAddress) {
      console.error('[stream] invalid artist wallet', { trackId, artistWallet })
      return NextResponse.json({ error: 'artist wallet invalid' }, { status: 500 })
    }
    const durationSeconds = typeof row.duration_seconds === 'number' && Number.isFinite(row.duration_seconds) && row.duration_seconds > 0 ? Math.floor(row.duration_seconds) : 0
    const pricePerMinuteCents = typeof row.price_per_minute_cents === 'number' && Number.isFinite(row.price_per_minute_cents) && row.price_per_minute_cents > 0 ? Math.floor(row.price_per_minute_cents) : 1
    const minutes = durationSeconds > 0 ? Math.max(1, Math.ceil(durationSeconds / 60)) : 1
    const totalPriceCents = minutes * pricePerMinuteCents
    console.log('[stream] pricing', { durationSeconds, pricePerMinuteCents, minutes, totalPriceCents })
    const paymentRequirements = buildPaymentRequirements(req, trackId, artistWallet, pricePerMinuteCents)
    const lower = req.headers.get('x-payment')
    const upper = req.headers.get('X-PAYMENT')
    const paymentHeader = lower || upper
    console.log('[stream] payment header inspect', {
      hasLower: !!lower,
      hasUpper: !!upper,
      length: paymentHeader ? paymentHeader.length : 0,
      prefix: paymentHeader ? paymentHeader.slice(0, 32) : ''
    })
    if (!paymentHeader) {
      console.log('[stream] no payment header, returning 402')
      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [paymentRequirements],
        },
        { status: 402 },
      )
    }
    console.log('[stream] payment header present, verifying with facilitator')
    try {
      const payload = decodePayment(paymentHeader) as any
      console.log('[stream] decoded payment payload', {
        scheme: payload?.scheme,
        network: payload?.network,
        version: payload?.x402Version,
      })
      const verifyResult: any = await verify(payload as any, paymentRequirements as any)
      console.log('[stream] facilitator verify result', verifyResult)
      if (!verifyResult?.isValid) {
        return NextResponse.json({ error: 'payment not valid', detail: verifyResult || null }, { status: 402 })
      }
      const settleResult: any = await settle(payload as any, paymentRequirements as any)
      console.log('[stream] facilitator settle result', settleResult)
      if (!settleResult?.success) {
        return NextResponse.json({ error: 'payment not settled', detail: settleResult || null }, { status: 402 })
      }
    } catch (payErr: any) {
      console.error('[stream] payment verify/settle error', payErr)
      return NextResponse.json({ error: 'payment verification failed' }, { status: 402 })
    }
    const synapse = await getSynapse()
    console.log('[stream] downloading audio', { audioCid: row.audio_cid })
    const bytes = await (synapse as any).storage.download(row.audio_cid)
    const payload = Buffer.from(bytes)
    const audio = decryptAes256GcmFromPayload(payload)
    console.log('[stream] audio decrypted', { byteLength: audio.length })
    return new NextResponse(audio as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length.toString(),
        'Cache-Control': 'no-store',
        'X-Track-Duration-Seconds': String(durationSeconds),
        'X-Track-Price-Per-Minute-Cents': String(pricePerMinuteCents),
        'X-Track-Total-Price-Cents': String(totalPriceCents),
      },
    })
  } catch (e: any) {
    console.error('[stream] error', e)
    return NextResponse.json({ error: e?.message || 'stream failed' }, { status: 500 })
  }
}


