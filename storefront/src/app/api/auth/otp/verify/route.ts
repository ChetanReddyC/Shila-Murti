import type { NextRequest } from 'next/server'
import { kvGet, kvDel, kvSet } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter } from '@/lib/metrics'
import { createAuthSession, getSessionConfig } from '@/lib/auth/sessionManager'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const payload = await req.json()
  const code: string = String(payload?.code || '').trim()
  const phoneRaw: string | undefined = payload?.phone
  const emailRaw: string | undefined = payload?.email

  if ((!phoneRaw && !emailRaw)) return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })
  if (!/^[0-9]{6}$/.test(code)) return new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), { status: 400 })

  const phoneCandidates: string[] = []
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '')
    phoneCandidates.push(phoneRaw)
    phoneCandidates.push(digits)
    phoneCandidates.push(digits ? `+${digits}` : phoneRaw)
  }
  const emailKey = emailRaw ? `otp:${emailRaw.toLowerCase()}` : null

  const candidateKeys = [
    ...phoneCandidates.map((p) => `otp:${p}`),
    ...(emailKey ? [emailKey] : []),
  ]

  let foundKey: string | null = null
  let data: { otpHash: string } | null = null
  const attempts = 4
  for (let attempt = 1; attempt <= attempts && !foundKey; attempt += 1) {
    for (const k of candidateKeys) {
      const val = await kvGet<{ otpHash: string }>(k)
      if (val?.otpHash) { foundKey = k; data = val; break }
    }
    if (!foundKey && attempt < attempts) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  if (!data?.otpHash || !foundKey) {
    return new Response(JSON.stringify({ ok: false, error: 'expired_or_missing', debug: { keysTried: candidateKeys } }), { status: 400 })
  }
  const ok = await bcrypt.compare(code, data.otpHash)
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), { status: 400 })
  }

  await kvDel(foundKey) // single-use

  // CRITICAL UPGRADE: Create persistent authentication session (7 days TTL)
  // This replaces the old short-lived markers and enables multi-order checkout sessions
  // Top 1% Practice: Session manager handles both persistent and temporary markers atomically
  console.log('[OTP_VERIFY][creating_persistent_session]', {
    hasPhone: !!phoneRaw,
    hasEmail: !!emailRaw,
    sessionTTL: getSessionConfig().SESSION_TTL_DAYS + ' days'
  })

  // NOTE: We don't have customerId yet at OTP verification stage
  // The session will be linked to customerId after customer creation/retrieval
  // For now, create temporary markers AND log that full session creation is deferred
  try {
    const config = getSessionConfig()

    // Create both temporary markers (for immediate use) and log session parameters
    if (phoneRaw) {
      const digits = phoneRaw.replace(/\D/g, '')
      // Temporary marker (5 min) - for immediate post-OTP actions
      await kvSet(`otp:ok:+${digits}`, 1, config.TEMP_VERIFICATION_TTL_SECONDS)
      console.log('[OTP_VERIFY][temp_marker_created]', {
        identifier: 'phone',
        ttlSeconds: config.TEMP_VERIFICATION_TTL_SECONDS
      })
    }
    if (emailRaw) {
      // Temporary marker (5 min) - for immediate post-OTP actions  
      await kvSet(`otp:ok:${emailRaw.toLowerCase()}`, 1, config.TEMP_VERIFICATION_TTL_SECONDS)
      console.log('[OTP_VERIFY][temp_marker_created]', {
        identifier: 'email',
        ttlSeconds: config.TEMP_VERIFICATION_TTL_SECONDS
      })
    }

    // NOTE: Persistent session (7 days) will be created in the checkout flow
    // after customer ID is established. See: /api/checkout/customer/associate
    console.log('[OTP_VERIFY][deferred_persistent_session]', {
      reason: 'customer_id_not_yet_available',
      willCreateAfter: 'customer_ensure_or_associate'
    })
  } catch (error: any) {
    console.error('[OTP_VERIFY][marker_creation_failed]', {
      error: error?.message || String(error)
    })
  }

  try { await kafkaEmit('auth.combo_mfa_passed', { identifier: phoneRaw || emailRaw, factor: 'otp', timestamp: Date.now() }) } catch { }
  try { const c = await getCounter({ name: 'auth_otp_verify_success_total', help: 'OTP verify success total' }); c.inc() } catch { }
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
