import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'nodejs'

function fwd(text: string, status: number) {
  if (status >= 400) {
    try { const b = JSON.parse(text); return Response.json({ error: b.error || 'server_error', message: b.message }, { status }) }
    catch { return Response.json({ error: 'server_error' }, { status }) }
  }
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } })
}

async function getCustomerIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions as any)
    if (!session || !(session as any)?.customerId) return null
    return (session as any).customerId
  } catch {
    return null
  }
}

async function getBridgeToken(customerId: string): Promise<string | null> {
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  return token || null
}

export async function GET() {
  const customerId = await getCustomerIdFromSession()
  if (!customerId) return new Response(JSON.stringify({ error: 'session_expired' }), { status: 401 })

  const token = await getBridgeToken(customerId)
  if (!token) return new Response(JSON.stringify({ error: 'auth_failed' }), { status: 500 })

  const res = await storeFetch('/store/custom/wishlist', {
    bearerToken: token,
    headers: { 'Accept': 'application/json' },
  })

  return fwd(await res.text(), res.status)
}

export async function POST(req: NextRequest) {
  const customerId = await getCustomerIdFromSession()
  if (!customerId) return new Response(JSON.stringify({ error: 'session_expired' }), { status: 401 })

  const token = await getBridgeToken(customerId)
  if (!token) return new Response(JSON.stringify({ error: 'auth_failed' }), { status: 500 })

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const res = await storeFetch('/store/custom/wishlist', {
    method: 'POST',
    bearerToken: token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return fwd(await res.text(), res.status)
}

export async function DELETE(req: NextRequest) {
  const customerId = await getCustomerIdFromSession()
  if (!customerId) return new Response(JSON.stringify({ error: 'session_expired' }), { status: 401 })

  const token = await getBridgeToken(customerId)
  if (!token) return new Response(JSON.stringify({ error: 'auth_failed' }), { status: 500 })

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const res = await storeFetch('/store/custom/wishlist', {
    method: 'DELETE',
    bearerToken: token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return fwd(await res.text(), res.status)
}
