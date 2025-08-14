import type { NextRequest } from 'next/server'
import { kvGet } from '@/lib/kv'
import { getCounter, getHistogram } from '@/lib/metrics'

function normalizeEmail(email?: string | null): string | undefined {
  if (!email) return undefined
  return String(email).trim().toLowerCase()
}

function normalizePhoneDigits(phone?: string | null): string | undefined {
  if (!phone) return undefined
  const digits = String(phone).replace(/\D/g, '')
  return digits ? `+${digits}` : undefined
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  let successCounter: any | null = null
  let failureCounter: any | null = null
  let latencyHistogram: any | null = null
  try {
    successCounter = await getCounter({ name: 'auth_checkout_verify_success_total', help: 'Checkout verify successes', labelNames: ['channel', 'cartId'] })
    failureCounter = await getCounter({ name: 'auth_checkout_verify_failure_total', help: 'Checkout verify failures', labelNames: ['channel', 'cartId'] })
    latencyHistogram = await getHistogram({ name: 'auth_checkout_verify_latency_ms', help: 'Checkout verify latency (ms)', labelNames: ['channel', 'cartId'] })
  } catch {}

  try {
    const body = await req.json().catch(() => ({} as any))
    const rawPhone: string | undefined = body?.phone
    const rawEmail: string | undefined = body?.email
    const cartId: string | undefined = body?.cartId

    const email = normalizeEmail(rawEmail)
    const phoneKey = normalizePhoneDigits(rawPhone)

    if (!email && !phoneKey) {
      try { failureCounter?.labels?.('unknown', String(cartId || 'none')).inc() } catch {}
      try { latencyHistogram?.labels?.('unknown', String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch {}
      return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })
    }

    // Determine verification markers
    let verified = false
    let channel: 'whatsapp' | 'email' = 'whatsapp'

    if (phoneKey) {
      channel = 'whatsapp'
      // Expect key set by /api/auth/otp/verify
      try {
        const marker = await kvGet<number | string | unknown>(`otp:ok:${phoneKey}`)
        verified = Boolean(marker)
      } catch {}
    } else if (email) {
      channel = 'email'
      // Expect key set by /api/auth/magic/confirm; allow state-scoped key for checkout cart
      const state = cartId ? `checkout-${cartId}` : ''
      const keyGeneral = `magic:ok:${email}`
      const keyState = state ? `magic:ok:${email}:${state}` : ''
      try {
        const [g, s] = await Promise.all([
          kvGet<number | string | unknown>(keyGeneral),
          keyState ? kvGet<number | string | unknown>(keyState) : Promise.resolve(null),
        ])
        verified = Boolean(s || g)
      } catch {}
    }

    if (!verified) {
      try { failureCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch {}
      try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch {}
      return new Response(JSON.stringify({ ok: false, error: 'not_verified' }), { status: 400 })
    }

    // Ensure/create Medusa customer
    const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
    const ensureRes = await fetch(`${base}/api/account/customer/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone: rawPhone }),
    })
    const ej = await ensureRes.json().catch(() => ({}))

    if (!ensureRes.ok || !ej?.customerId) {
      try { failureCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch {}
      try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch {}
      const code = ensureRes.status || 500
      return new Response(JSON.stringify({ ok: false, error: ej?.error || 'ensure_failed' }), { status: code })
    }

    try { successCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch {}
    try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch {}
    // Indicate to the client that no redirect is needed; client performs signIn with redirect: false
    return new Response(JSON.stringify({ ok: true, customerId: ej.customerId, redirect: false }), { status: 200 })
  } catch (e: any) {
    try { failureCounter?.labels?.('unknown', 'none').inc() } catch {}
    try { latencyHistogram?.labels?.('unknown', 'none')?.observe?.(Date.now() - startedAt) } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), { status: 500 })
  }
}


