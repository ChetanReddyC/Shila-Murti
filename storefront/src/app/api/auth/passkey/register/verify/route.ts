import type { NextRequest } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { kvGet, kvDel, kvSet } from '@/lib/kv'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const { userId, credential, username } = await req.json().catch(() => ({}))
  console.log('[PASSKEY_REGISTER_VERIFY] Request:', { userId, username, hasCredential: !!credential })
  if (!userId || !credential) return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400 })

  const reg = await kvGet<{ challenge: string }>(`webauthn:reg:${userId}`)
  if (!reg?.challenge) return new Response(JSON.stringify({ error: 'missing_challenge' }), { status: 400 })

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: reg.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    return new Response(JSON.stringify({ verified: false }), { status: 400 })
  }

  const info = verification.registrationInfo
  const record = {
    credentialID: Buffer.from(info.credentialID).toString('base64url'),
    credentialPublicKey: Buffer.from(info.credentialPublicKey).toString('base64url'),
    counter: info.counter,
    credentialDeviceType: info.credentialDeviceType,
    credentialBackedUp: info.credentialBackedUp,
    transports: info.transports,
  }
  
  // Store credential with userId as part of the key
  const credKey = `webauthn:cred:${userId}:${record.credentialID}`
  await kvSet(credKey, record)
  console.log('[PASSKEY_REGISTER_VERIFY] Stored credential at:', credKey)
  
  // CRITICAL: Store reverse mapping for conditional UI lookups
  // This allows finding userId from credentialID without listing keys
  // Also store the username (original identifier: email or phone) for proper user identification
  const mapKey = `webauthn:cred-map:${record.credentialID}`
  await kvSet(mapKey, { userId, username })
  console.log('[PASSKEY_REGISTER_VERIFY] Stored reverse mapping:', mapKey, '→', { userId, username })
  
  await kvDel(`webauthn:reg:${userId}`)

  // Mark presence counter/flag for policy gate
  try {
    const countKey = `webauthn:cred:count:${userId}`
    const existsKey = `webauthn:cred:exists:${userId}`
    // Best-effort, non-atomic increment for CF; Upstash helper exists but not required
    const current = await kvGet<string | number | null>(countKey)
    const n = (typeof current === 'number' ? current : parseInt(String(current || '0'), 10)) || 0
    await kvSet(countKey, String(n + 1))
    await kvSet(existsKey, '1')
  } catch {}

  return new Response(JSON.stringify({ verified: true }), { status: 200 })
}


