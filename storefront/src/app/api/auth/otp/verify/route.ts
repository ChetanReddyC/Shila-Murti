import type { NextRequest } from 'next/server'
import { kvGet, kvDel } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter } from '@/lib/metrics'
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
    console.warn('[OTP VERIFY] No matching key found', { candidateKeys })
    return new Response(JSON.stringify({ ok: false, error: 'expired_or_missing', debug: { keysTried: candidateKeys } }), { status: 400 })
  }
  const ok = await bcrypt.compare(code, data.otpHash)
  if (!ok) {
    console.warn('[OTP VERIFY] Invalid code for key', { key: foundKey })
    return new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), { status: 400 })
  }

  await kvDel(foundKey) // single-use
  try { await kafkaEmit('auth.combo_mfa_passed', { identifier: phoneRaw || emailRaw, factor: 'otp', timestamp: Date.now() }) } catch {}
  try { const c = await getCounter({ name: 'auth_otp_verify_success_total', help: 'OTP verify success total' }); c.inc() } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}


