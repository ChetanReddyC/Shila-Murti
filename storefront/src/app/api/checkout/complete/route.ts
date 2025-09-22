import { NextRequest, NextResponse } from 'next/server'
import { medusaApiClient } from '@/utils/medusaApiClient'
import { kvGet } from '@/lib/kv'

export async function POST(req: NextRequest) {
  console.log('[complete-route] handler start', 'URL:', req.url)
  try {
    const { searchParams } = new URL(req.url)
    const cartId = searchParams.get('cartId')
    const body = await req.json().catch(() => ({})) as any
    console.log('[complete-route] parsed params:', { cartId, body })
    const orderId = typeof body?.orderId === 'string' ? body.orderId : undefined
    if (orderId && !cartId) {
      console.log('[complete-route] resolving cartId from orderId:', orderId)
      // Try resolve from in-memory map (dev only)
      const map: Map<string, string> | undefined = (global as any).orderCartMap
      const mapped = map?.get(orderId)
      console.log('[complete-route] in-memory map lookup:', mapped)
      if (mapped) {
        console.log('[complete-route] using in-memory mapped cartId')
        return await handleComplete(mapped)
      }
      // Try KV-backed mapping
      try {
        console.log('[complete-route] looking up KV map for orderId')
        const kvMapped = await kvGet<string>(`cf:order:cart:${orderId}`)
        console.log('[complete-route] KV lookup result:', kvMapped)
        if (kvMapped) {
          console.log('[complete-route] using KV mapped cartId')
          return await handleComplete(kvMapped)
        }
      } catch (err) {
        console.warn('[complete-route] KV lookup error:', err)
      }
    }
    if (!cartId) return NextResponse.json({ error: 'cartId required' }, { status: 400 })
    console.log('[complete-route] completing cartId:', cartId)
    return await handleComplete(cartId)
  } catch (e: any) {
    console.error('[complete-route] handler exception:', e)
    return NextResponse.json({ error: 'server_error', message: e?.message || String(e) }, { status: 500 })
  }
}

async function handleComplete(cartId: string) {
  try {
    console.log('[complete-route] handleComplete start for cartId:', cartId)
    const result = await medusaApiClient.completeCart(cartId)
    console.log('[complete-route] medusaApiClient.completeCart result:', result)
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    console.error('[complete-route] handleComplete error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'complete_failed' }, { status: 400 })
  }
}


