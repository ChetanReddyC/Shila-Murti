import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  
  if (!orderId) {
    return new Response(JSON.stringify({ ok: false, error: 'order_id_required' }), { status: 400 })
  }

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customer_id')
  
  if (!customerId) {
    return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
  }

  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  
  if (!token) {
    console.error('[ORDER_CANCEL][TOKEN_ERROR]', 'Failed to generate bridge token')
    return new Response(JSON.stringify({ ok: false, error: 'auth_failed' }), { status: 500 })
  }

  const res = await storeFetch(`/store/custom/orders/${orderId}/cancel`, { 
    method: 'POST',
    bearerToken: token,
    headers: { 'Accept': 'application/json' }
  })
  
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[ORDER_CANCEL][FETCH_ERROR]', { status: res.status, body: text?.slice?.(0, 200) })
    return new Response(text || JSON.stringify({ ok: false, error: 'cancel_failed' }), { 
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  const text = await res.text().catch(() => '')
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } })
}
