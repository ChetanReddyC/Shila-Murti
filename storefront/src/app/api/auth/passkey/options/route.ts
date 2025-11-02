import type { NextRequest } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { kvSet, kvGet, kvListKeys } from '@/lib/kv'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'

async function ensureCustomerId(identifier: { email?: string; phone?: string; userId?: string }): Promise<{ customerId: string; fallbackId: string } | null> {
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
      console.warn('[PASSKEY_OPTIONS][ENSURE_FAILED]', { status: res.status, identifier, fallbackId })
      return { customerId: fallbackId, fallbackId }
    }
    return { customerId: String(json.customerId), fallbackId }
  } catch (err) {
    console.warn('[PASSKEY_OPTIONS][ENSURE_ERROR]', err)
    return { customerId: fallbackId, fallbackId }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  
  // Handle Conditional UI requests (no specific identifier yet)
  if (body.conditionalUI === true) {
    console.log('[PASSKEY_OPTIONS][CONDITIONAL_UI] Generating generic challenge')
    
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      timeout: 300000, // 5 minutes for conditional UI
      allowCredentials: [], // Let browser show all available passkeys
    })
    
    // Store challenge under a temporary conditional UI key
    const conditionalKey = `webauthn:auth:conditional:${options.challenge}`
    await kvSet(conditionalKey, { challenge: options.challenge, timestamp: Date.now() }, 10 * 60)
    
    return new Response(JSON.stringify({ 
      options, 
      userId: 'conditional-ui',
      isConditionalUI: true 
    }), { status: 200 })
  }
  
  // Regular flow with specific identifier
  const result = await ensureCustomerId(body)
  if (!result) return new Response(JSON.stringify({ error: 'missing_identifier' }), { status: 400 })

  const { customerId, fallbackId } = result
  
  // Check which ID actually has credentials stored
  // We'll store the challenge under both IDs to ensure authentication works with either
  const idsToCheck = customerId === fallbackId ? [customerId] : [customerId, fallbackId]
  
  let actualUserId = customerId
  
  // Check which ID has credentials
  for (const cid of idsToCheck) {
    try {
      const countKey = `webauthn:cred:count:${cid}`
      const existsKey = `webauthn:cred:exists:${cid}`
      const countStr = await kvGet<string>(countKey)
      const existsStr = await kvGet<string>(existsKey)
      
      if (countStr && String(countStr) !== '0') {
        actualUserId = cid
        break
      }
      if (existsStr && String(existsStr) !== '0') {
        actualUserId = cid
        break
      }
      
      // Check if credentials exist by listing
      const names = await kvListKeys(`webauthn:cred:${cid}:`, 1)
      if (Array.isArray(names) && names.length > 0) {
        actualUserId = cid
        break
      }
    } catch {}
  }

  console.log('[PASSKEY_OPTIONS][USER_ID]', { customerId, fallbackId, actualUserId })

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: [], // discoverable credentials → platform can find by user handle
  })
  
  // Store challenge under the actual user ID that has credentials
  await kvSet(`webauthn:auth:${actualUserId}`, { challenge: options.challenge }, 5 * 60)
  
  // Also store under alternate ID if different, for fallback
  if (actualUserId !== customerId) {
    await kvSet(`webauthn:auth:${customerId}`, { challenge: options.challenge }, 5 * 60)
  }
  if (actualUserId !== fallbackId && customerId !== fallbackId) {
    await kvSet(`webauthn:auth:${fallbackId}`, { challenge: options.challenge }, 5 * 60)
  }
  
  return new Response(JSON.stringify({ options, userId: actualUserId }), { status: 200 })
}


