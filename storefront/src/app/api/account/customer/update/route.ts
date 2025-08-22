import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'nodejs'

const BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'

async function resolveCustomerIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions as any)
    const cid = (session as any)?.customerId
    return cid ? String(cid) : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const customerId = await resolveCustomerIdFromSession()
  if (!customerId) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true, purpose: 'account.update' })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })

  const raw = await req.json().catch(() => ({}))
  // Allowlist fields to forward to backend
  const allowedKeys = ['first_name', 'last_name', 'email', 'phone', 'metadata', 'addresses']
  const payload: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in raw) payload[key] = raw[key]
  }

  const res = await storeFetch('/store/custom/customer/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    bearerToken: token,
    body: JSON.stringify(payload) as any,
  })

  const text = await res.text().catch(() => '')
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}