import type { NextRequest } from 'next/server'
import { kvGet, kvListKeys } from '@/lib/kv'
import { getCounter, getHistogram } from '@/lib/metrics'

async function ensureCustomerId(identifier: { email?: string; phone?: string; userId?: string }): Promise<{ customerId: string; fallbackId: string; created?: boolean } | null> {
  if (identifier.userId) {
    const id = String(identifier.userId)
    return { customerId: id, fallbackId: id }
  }
  let email = identifier.email
  let phone = identifier.phone
  if (!email && !phone && identifier.userId) {
    const candidate = String(identifier.userId)
    if (candidate.includes('@')) email = candidate
    else phone = candidate
  }
  if (!email && !phone) return null
  
  // Create fallback ID for cases where backend lookup fails
  const fallbackId = (email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`)
  
  try {
    const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/account/customer/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.customerId) {
      console.warn('[PASSKEY_POLICY][ENSURE_FAILED]', { status: res.status, identifier, fallbackId })
      return { customerId: fallbackId, fallbackId }
    }
    return { customerId: String(json.customerId), fallbackId, created: !!json?.created }
  } catch (err) {
    console.warn('[PASSKEY_POLICY][ENSURE_ERROR]', err)
    return { customerId: fallbackId, fallbackId }
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const body = await req.json().catch(() => ({}))
  const result = await ensureCustomerId(body)
  if (!result) return new Response(JSON.stringify({ error: 'missing_identifier' }), { status: 400 })

  const { customerId, fallbackId } = result
  
  // Check for passkeys using both customerId and fallbackId
  // This ensures we find passkeys even if the customerId has changed or lookup failed
  const idsToCheck = customerId === fallbackId ? [customerId] : [customerId, fallbackId]
  
  let hasPasskey = false
  let foundWithId: string | null = null

  for (const cid of idsToCheck) {
    // Primary: presence via maintained count flag
    const countKey = `webauthn:cred:count:${cid}`
    const existsKey = `webauthn:cred:exists:${cid}`
    const countStr = await kvGet<string>(countKey)
    const existsStr = await kvGet<string>(existsKey)
    
    if (countStr && String(countStr) !== '0') {
      const count = parseInt(String(countStr), 10)
      if (!Number.isNaN(count) && count > 0) {
        hasPasskey = true
        foundWithId = cid
        break
      }
    }
    if (!hasPasskey && existsStr && String(existsStr) !== '0') {
      hasPasskey = true
      foundWithId = cid
      break
    }

    // Fallback: try listing credentials if provider supports it
    if (!hasPasskey) {
      try {
        const names = await kvListKeys(`webauthn:cred:${cid}:`, 1)
        if (Array.isArray(names) && names.length > 0) {
          hasPasskey = true
          foundWithId = cid
          break
        }
      } catch {}
    }
  }

  console.log('[PASSKEY_POLICY][RESULT]', { 
    customerId, 
    fallbackId, 
    hasPasskey, 
    foundWithId,
    checkedIds: idsToCheck 
  })

  try { const h = await getHistogram({ name: 'auth_passkey_policy_latency_ms', help: 'Passkey policy latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  try { const c = await getCounter({ name: hasPasskey ? 'auth_passkey_available_total' : 'auth_passkey_unavailable_total', help: 'Passkey availability decisions' }); c.inc() } catch {}
  
  // Return the ID that was used to find the passkey, or the customerId as primary choice
  return new Response(JSON.stringify({ ok: true, hasPasskey, userId: foundWithId || customerId, created: !!result.created }), { status: 200 })
}


