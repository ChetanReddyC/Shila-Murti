import type { NextRequest } from 'next/server'
import { kvListKeys, kvGet, kvDel, kvSet } from '@/lib/kv'

export const runtime = 'edge'

function resolveCustomerId(req: NextRequest): string | null {
  const url = new URL(req.url)
  const qp = url.searchParams.get('customer_id')
  if (qp) return qp
  const hdr = req.headers.get('x-customer-id')
  if (hdr) return hdr
  return null
}

export async function GET(req: NextRequest) {
  const customerId = resolveCustomerId(req)
  if (!customerId) return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
  try {
    const prefix = `webauthn:cred:${customerId}:`
    const names = await kvListKeys(prefix, 1000)
    const creds: any[] = []
    for (const name of names) {
      const rec = await kvGet<Record<string, any>>(name)
      if (rec) creds.push({ id: name.replace(prefix, ''), ...rec })
    }
    return new Response(JSON.stringify({ ok: true, credentials: creds }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'list_failed' }), { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const customerId = resolveCustomerId(req)
  if (!customerId) return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
  const { credentialId } = await req.json().catch(() => ({}))
  if (!credentialId) return new Response(JSON.stringify({ ok: false, error: 'credential_id_required' }), { status: 400 })
  try {
    await kvDel(`webauthn:cred:${customerId}:${credentialId}`)
    // Best-effort decrement: read current count and clamp at 0
    try {
      const countKey = `webauthn:cred:count:${customerId}`
      const current = await kvGet<string | number | null>(countKey)
      const n = (typeof current === 'number' ? current : parseInt(String(current || '0'), 10)) || 0
      const next = Math.max(0, n - 1)
      await kvSet(countKey, String(next))
      if (next === 0) await kvSet(`webauthn:cred:exists:${customerId}`, '0')
    } catch {}
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'delete_failed' }), { status: 500 })
  }
}


