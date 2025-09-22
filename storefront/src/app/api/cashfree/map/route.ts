import type { NextRequest } from 'next/server'
import { kvSet } from '@/lib/kv'

export async function POST(req: NextRequest) {
  console.log('[map] Cashfree mapping handler start, method:', req.method)
  try {
    const body = await req.json().catch(() => ({})) as any
    console.log('[map] parsed body:', body)
    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const cartId = typeof body?.cartId === 'string' ? body.cartId : ''
    if (!orderId || !cartId) {
      console.warn('[map] missing params orderId or cartId')
      return new Response(JSON.stringify({ ok: false, error: 'missing_params' }), { status: 400 })
    }
    const key = `cf:order:cart:${orderId}`
    console.log('[map] setting KV key:', key, '->', cartId)
    // Keep mapping for 2 hours
    await kvSet(key, cartId, 2 * 60 * 60)
    console.log('[map] KV set successful')
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'error' }), { status: 500 })
  }
}


