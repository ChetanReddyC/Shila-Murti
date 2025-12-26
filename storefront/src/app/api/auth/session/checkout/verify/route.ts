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
  } catch { }

  try {
    const body = await req.json().catch(() => ({} as any))
    const rawPhone: string | undefined = body?.phone
    const rawEmail: string | undefined = body?.email
    const cartId: string | undefined = body?.cartId
    const isPasskeyAuth: boolean | undefined = body?.isPasskeyAuth
    const formData: any = body?.formData // Checkout form data for account creation

    const email = normalizeEmail(rawEmail)
    const phoneKey = normalizePhoneDigits(rawPhone)

    if (!email && !phoneKey) {
      try { failureCounter?.labels?.('unknown', String(cartId || 'none')).inc() } catch { }
      try { latencyHistogram?.labels?.('unknown', String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
      return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })
    }

    // For passkey authentication, we don't need to check verification markers
    // The passkey verification already confirmed the user's identity
    if (isPasskeyAuth) {
      // Ensure/create Medusa customer
      const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
      const ensureRes = await fetch(`${base}/api/account/customer/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone: rawPhone, formData, cart_id: cartId }), // Include cart_id
      })
      const ej = await ensureRes.json().catch(() => ({}))

      if (!ensureRes.ok || !ej?.customerId) {
        try { failureCounter?.labels?.('passkey', String(cartId || 'none')).inc() } catch { }
        try { latencyHistogram?.labels?.('passkey', String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
        const code = ensureRes.status || 500
        return new Response(JSON.stringify({ ok: false, error: ej?.error || 'ensure_failed' }), { status: code })
      }

      try { successCounter?.labels?.('passkey', String(cartId || 'none')).inc() } catch { }
      try { latencyHistogram?.labels?.('passkey', String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
      // Indicate to the client that no redirect is needed; client performs signIn with redirect: false
      return new Response(JSON.stringify({ ok: true, customerId: ej.customerId, redirect: false }), { status: 200 })
    }

    // Determine verification markers for OTP/magic link flows
    let verified = false
    let channel: 'whatsapp' | 'email' = 'whatsapp'

    if (phoneKey) {
      channel = 'whatsapp'
      // Expect key set by /api/auth/otp/verify
      try {
        const marker = await kvGet<number | string | unknown>(`otp:ok:${phoneKey}`)
        verified = Boolean(marker)
      } catch { }
    } else if (email) {
      channel = 'email'
      // Expect key set by /api/auth/magic/confirm; allow state-scoped key for checkout cart
      const state = cartId ? `checkout-${cartId}` : ''
      const keyGeneral = `magic:ok:${email}`
      const keyState = state ? `magic:ok:${email}:${state}` : ''

      console.log('[CHECKOUT_VERIFY] Checking magic link verification:', {
        email,
        cartId,
        state,
        keyGeneral,
        keyState,
      })

      // Cloudflare KV has eventual consistency - writes can take 1-2 seconds to propagate
      // We retry a few times with exponential backoff to handle this
      const MAX_RETRIES = 5
      const INITIAL_DELAY_MS = 500

      for (let attempt = 0; attempt < MAX_RETRIES && !verified; attempt++) {
        if (attempt > 0) {
          // Wait before retry with exponential backoff
          const delay = INITIAL_DELAY_MS * Math.pow(1.5, attempt - 1)
          console.log(`[CHECKOUT_VERIFY] Retry attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        try {
          const [g, s] = await Promise.all([
            kvGet<number | string | unknown>(keyGeneral),
            keyState ? kvGet<number | string | unknown>(keyState) : Promise.resolve(null),
          ])

          console.log('[CHECKOUT_VERIFY] KV lookup results:', {
            attempt: attempt + 1,
            generalKeyValue: g,
            stateKeyValue: s,
            generalKeyFound: Boolean(g),
            stateKeyFound: Boolean(s),
          })

          verified = Boolean(s || g)

          if (verified) {
            console.log(`[CHECKOUT_VERIFY] Verification succeeded on attempt ${attempt + 1}`)
            break
          }
        } catch (kvError) {
          console.error('[CHECKOUT_VERIFY] KV lookup error:', kvError)
        }
      }

      if (!verified) {
        console.warn('[CHECKOUT_VERIFY] Verification failed after all retries - no valid marker found in KV')
      }
    }

    if (!verified) {
      try { failureCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch { }
      try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
      return new Response(JSON.stringify({ ok: false, error: 'not_verified' }), { status: 400 })
    }

    // Ensure/create Medusa customer - pass the actual auth method
    const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
    const ensureRes = await fetch(`${base}/api/account/customer/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        phone: rawPhone,
        formData,
        cart_id: cartId,
        // IMPORTANT: Pass the actual authentication method 
        // This prevents confusing delivery phone with auth phone
        authMethod: channel  // 'email' for magic link, 'whatsapp' for OTP
      }),
    })
    const ej = await ensureRes.json().catch(() => ({}))

    if (!ensureRes.ok || !ej?.customerId) {
      try { failureCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch { }
      try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
      const code = ensureRes.status || 500
      return new Response(JSON.stringify({ ok: false, error: ej?.error || 'ensure_failed' }), { status: code })
    }

    try { successCounter?.labels?.(channel, String(cartId || 'none')).inc() } catch { }
    try { latencyHistogram?.labels?.(channel, String(cartId || 'none'))?.observe?.(Date.now() - startedAt) } catch { }
    // Indicate to the client that no redirect is needed; client performs signIn with redirect: false
    return new Response(JSON.stringify({ ok: true, customerId: ej.customerId, redirect: false }), { status: 200 })
  } catch (e: any) {
    try { failureCounter?.labels?.('unknown', 'none').inc() } catch { }
    try { latencyHistogram?.labels?.('unknown', 'none')?.observe?.(Date.now() - startedAt) } catch { }
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), { status: 500 })
  }
}