import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const { customerId, comboRequired = false, otpOK = false, magicOK = false, mfaComplete = false } = body || {}
    if (!customerId || typeof customerId !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
    }
    const token = await signBridgeToken({ sub: customerId, comboRequired, otpOK, magicOK, mfaComplete })
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
    }
    return new Response(JSON.stringify({ ok: true, token }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), { status: 500 })
  }
}


