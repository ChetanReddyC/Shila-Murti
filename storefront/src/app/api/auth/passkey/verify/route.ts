import type { NextRequest } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { kvGet, kvSet, kvDel } from '@/lib/kv'
import { getCounter, getHistogram } from '@/lib/metrics'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'

async function ensureCustomerIdFromBody(identifier: { email?: string; phone?: string; userId?: string }): Promise<string | null> {
  if (identifier.userId) {
    return String(identifier.userId)
  }
  let email = identifier.email
  let phone = identifier.phone
  if (!email && !phone && identifier.userId) {
    const candidate = String(identifier.userId)
    if (candidate.includes('@')) email = candidate
    else phone = candidate
  }
  if (!email && !phone) return null
  try {
    const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/account/customer/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.customerId) {
      const id = (email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`)
      return id
    }
    return String(json.customerId)
  } catch { return null }
}

function normalizeCandidatesFromBody(body: any): string[] {
  const candidates = new Set<string>()
  
  // Add userId if present (but skip generic conditional-ui)
  if (body?.userId && body.userId !== 'conditional-ui') {
    candidates.add(String(body.userId))
  }
  
  // Add email if present (normalized)
  if (body?.email) {
    const email = String(body.email).toLowerCase()
    candidates.add(email)
  }
  
  // Add phone if present (in multiple formats)
  if (body?.phone) {
    const phone = String(body.phone)
    candidates.add(phone)
    
    // Add digits-only version
    const digits = phone.replace(/\D/g, '')
    if (digits) {
      candidates.add(digits)
      candidates.add(`+${digits}`)
    }
  }
  
  // Add demo-user for historical compatibility
  candidates.add('demo-user')
  
  return Array.from(candidates)
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const body = await req.json().catch(() => ({}))
  
  console.log('[PASSKEY_VERIFY] Request body:', { 
    id: body.id, 
    userId: body.userId, 
    conditionalUI: body.conditionalUI,
    hasEmail: !!body.email,
    hasPhone: !!body.phone
  })
  
  // Handle Conditional UI requests
  const isConditionalUI = body.conditionalUI === true || body.userId === 'conditional-ui'
  console.log('[PASSKEY_VERIFY] isConditionalUI:', isConditionalUI)
  
  let cid = await ensureCustomerIdFromBody(body)
  if (!cid) {
    // Fallback to a deterministic id when ensure failed (e.g., admin 401)
    if (body?.email) cid = String(body.email).toLowerCase()
    else if (body?.phone) {
      const digits = String(body.phone).replace(/\D/g,'')
      cid = digits ? `+${digits}` : String(body.phone)
    }
  }
  const rawCandidates = normalizeCandidatesFromBody(body)
  if (!cid || !body?.id) {
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_id' }), { status: 200 })
  }

  // Enhanced validation: Check if the request contains all required fields
  if (!body.response || !body.response.authenticatorData || !body.response.clientDataJSON || !body.response.signature) {
    return new Response(JSON.stringify({ comboRequired: true, reason: 'invalid_response' }), { status: 200 })
  }

  // Try to find challenge using primary ID first, then fall back to candidates
  let auth = await kvGet<{ challenge: string }>(`webauthn:auth:${cid}`)
  
  // For conditional UI, also check the conditional challenge storage
  if (!auth?.challenge && isConditionalUI) {
    // Try to extract challenge from the clientDataJSON
    try {
      const clientDataJSON = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64').toString())
      const challenge = clientDataJSON.challenge
      if (challenge) {
        const conditionalKey = `webauthn:auth:conditional:${challenge}`
        const conditionalAuth = await kvGet<{ challenge: string }>(conditionalKey)
        if (conditionalAuth?.challenge) {
          auth = conditionalAuth
          console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Challenge found in conditional storage')
        }
      }
    } catch (err) {
      console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] Failed to extract challenge:', err)
    }
  }
  
  if (!auth?.challenge) {
    // Try candidates as fallback
    for (const candidate of rawCandidates) {
      auth = await kvGet<{ challenge: string }>(`webauthn:auth:${candidate}`)
      if (auth?.challenge) {
        console.log('[PASSKEY_VERIFY][CHALLENGE_FOUND_WITH_FALLBACK]', { primaryId: cid, foundWithId: candidate })
        break
      }
    }
  }
  if (!auth?.challenge) {
    console.warn('[PASSKEY_VERIFY][MISSING_CHALLENGE]', { cid, candidates: rawCandidates, isConditionalUI })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_challenge' }), { status: 200 })
  }

  // For Conditional UI: ALWAYS try to get the username from the mapping first
  // This ensures we have the actual phone/email even if credential is found in cache
  let mappedUsername: string | undefined
  if (isConditionalUI) {
    try {
      console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Looking up username from credential map:', body.id)
      
      // Get the username from reverse mapping
      const mapping = await kvGet<{ userId: string; username?: string }>(`webauthn:cred-map:${body.id}`)
      
      if (mapping?.username) {
        mappedUsername = mapping.username
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Found username in mapping:', mappedUsername)
      } else {
        console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] No username in mapping for credential:', body.id)
      }
    } catch (mappingErr) {
      console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] Failed to get username from mapping:', mappingErr)
    }
  }
  
  // Load stored authenticator for this credential id
  console.log('[PASSKEY_VERIFY] Looking for credential:', {
    primaryKey: `webauthn:cred:${cid}:${body.id}`,
    cid,
    credentialId: body.id,
    candidates: rawCandidates
  })
  
  let credRecord = await kvGet<{ credentialID: string; credentialPublicKey: string; counter: number }>(`webauthn:cred:${cid}:${body.id}`)
  let actualUserId = cid // Track which userId actually has this credential
  
  console.log('[PASSKEY_VERIFY] Primary lookup result:', credRecord ? 'FOUND' : 'NOT FOUND')
  
  // Fallback: search older namespaces and migrate if found
  if (!credRecord) {
    console.log('[PASSKEY_VERIFY] Searching candidates:', rawCandidates)
    for (const cand of rawCandidates) {
      const key = `webauthn:cred:${cand}:${body.id}`
      console.log('[PASSKEY_VERIFY] Trying candidate key:', key)
      const rec = await kvGet<{ credentialID: string; credentialPublicKey: string; counter: number }>(key)
      if (rec) {
        console.log('[PASSKEY_VERIFY] Found with candidate:', cand)
        credRecord = rec
        actualUserId = cand // Remember the actual userId
        try { await kvSet(`webauthn:cred:${cid}:${body.id}`, rec) } catch {}
        break
      }
    }
  }
  
  // For Conditional UI: if we still don't have credential AND no username yet, use reverse mapping for both
  if (!credRecord && isConditionalUI && !mappedUsername) {
    try {
      console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Looking up userId from credential map:', body.id)
      
      // Use reverse mapping: webauthn:cred-map:{credentialID} -> { userId, username }
      const mapping = await kvGet<{ userId: string; username?: string }>(`webauthn:cred-map:${body.id}`)
      
      if (mapping?.userId) {
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Found mapping:', { userId: mapping.userId, username: mapping.username })
        
        // Store the username for later use
        mappedUsername = mapping.username
        
        // Load the actual credential using the userId from mapping
        const credKey = `webauthn:cred:${mapping.userId}:${body.id}`
        const rec = await kvGet<{ credentialID: string; credentialPublicKey: string; counter: number }>(credKey)
        
        if (rec) {
          credRecord = rec
          actualUserId = mapping.userId
          console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Successfully loaded credential for userId:', mapping.userId)
        } else {
          console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] Mapping found but credential missing at:', credKey)
        }
      } else {
        console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] No mapping found for credential:', body.id)
      }
    } catch (searchErr) {
      console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] Mapping lookup failed:', searchErr)
    }
  }
  
  if (!credRecord) {
    console.warn('[PASSKEY_VERIFY][MISSING_CREDENTIAL]', { cid, credentialId: body.id, isConditionalUI, candidates: rawCandidates })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_credential' }), { status: 200 })
  }

  const b64urlToBuf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  // Enhanced validation: Verify that the credential record contains all required fields
  if (!credRecord.credentialID || !credRecord.credentialPublicKey) {
    return new Response(JSON.stringify({ comboRequired: true, reason: 'invalid_credential' }), { status: 200 })
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: auth.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: b64urlToBuf(credRecord.credentialID),
      credentialPublicKey: b64urlToBuf(credRecord.credentialPublicKey),
      counter: credRecord.counter || 0,
      transports: ['internal'],
    },
    requireUserVerification: true,
  })

  // Clean up challenges for all possible IDs
  await kvDel(`webauthn:auth:${cid}`)
  for (const candidate of rawCandidates) {
    if (candidate !== cid) {
      try { await kvDel(`webauthn:auth:${candidate}`) } catch {}
    }
  }
  
  if (!verification.verified) {
    try { const c = await getCounter({ name: 'auth_passkey_failure_total', help: 'Passkey verify failure total' }); c.inc() } catch {}
    return new Response(JSON.stringify({ comboRequired: true, reason: 'verification_failed' }), { status: 200 })
  }

  // Update counter
  const newCounter = verification.authenticationInfo?.newCounter
  if (typeof newCounter === 'number') {
    await kvSet(`webauthn:cred:${cid}:${body.id}` , { ...credRecord, counter: newCounter })
  }

  // Successful platform passkey auth: skip combo-MFA
  // Also provide a minimal descriptor so the client can refresh passkey lists immediately
  try { const h = await getHistogram({ name: 'auth_passkey_verify_latency_ms', help: 'Passkey verification latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  try { const c = await getCounter({ name: 'auth_passkey_success_total', help: 'Passkey verify success total' }); c.inc() } catch {}
  
  const response: any = { 
    comboRequired: false, 
    hasPasskey: true, 
    credentialId: body.id, 
    counter: newCounter ?? credRecord.counter 
  }
  
  // For conditional UI, include user identifier information
  if (isConditionalUI) {
    // Use the actualUserId (the one we found the credential under)
    const userIdToUse = actualUserId || cid
    console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Using actualUserId:', userIdToUse, 'mappedUsername:', mappedUsername)
    
    // CRITICAL: Use the stored username (original identifier) if available
    // This ensures we return the actual phone/email, not the customerId
    if (mappedUsername) {
      // The username is the original identifier (phone or email)
      if (mappedUsername.includes('@')) {
        response.email = mappedUsername
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Using stored username as email:', mappedUsername)
      } else {
        response.phone = mappedUsername
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Using stored username as phone:', mappedUsername)
      }
    } else if (body.email) {
      response.email = body.email
    } else if (body.phone) {
      response.phone = body.phone
    } else {
      // Fallback: Determine from actualUserId if it looks like email or phone
      if (userIdToUse.includes('@')) {
        response.email = userIdToUse
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Identified as email from userId:', userIdToUse)
      } else if (userIdToUse.includes('+') || /^\d+$/.test(userIdToUse.replace(/[\s\-\(\)]/g, ''))) {
        response.phone = userIdToUse
        console.log('[PASSKEY_VERIFY][CONDITIONAL_UI] Identified as phone from userId:', userIdToUse)
      } else {
        // Try to look up from stored user data or fallback
        console.warn('[PASSKEY_VERIFY][CONDITIONAL_UI] Could not identify user type from:', userIdToUse)
        // Fallback: treat as phone if not email
        response.phone = userIdToUse
      }
    }
  }
  
  return new Response(JSON.stringify(response), { status: 200 })
}