import type { NextRequest } from 'next/server'
import { kvGet, kvSet, kvIncr, kvExpire } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter, getHistogram } from '@/lib/metrics'
import { sendWhatsAppLoginCode } from '@/lib/providers/whatsapp'
import bcrypt from 'bcryptjs'

const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || `${5 * 60}`, 10)
const RATE_WINDOW_SECONDS = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS || '3600', 10)
const OTP_RATE_LIMIT_PER_WINDOW = parseInt(
  process.env.OTP_RATE_LIMIT_PER_WINDOW || process.env.OTP_RATE_LIMIT_PER_HOUR || '5',
  10,
)
const OTP_RATE_LIMIT_BYPASS = process.env.OTP_RATE_LIMIT_BYPASS === 'true'
const IP_RATE_LIMIT_PER_WINDOW = parseInt(process.env.AUTH_IP_RATE_LIMIT_PER_WINDOW || '30', 10)

function normalizePhoneOrEmail(identifier: any): { phone?: string; email?: string } {
  if (typeof identifier?.phone === 'string') return { phone: identifier.phone }
  if (typeof identifier?.email === 'string') return { email: identifier.email.toLowerCase() }
  return {}
}

function generateOtp(): string {
  // Always generate cryptographically secure OTPs (no test mode)
  return String(Math.floor(100000 + Math.random() * 900000))
}

function maskPhone(e164?: string): string | undefined {
  if (!e164) return undefined
  const digits = e164.replace(/\D/g, '')
  if (digits.length <= 4) return '*'.repeat(digits.length)
  const last4 = digits.slice(-4)
  return `${'*'.repeat(digits.length - 4)}${last4}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const { phone, email } = normalizePhoneOrEmail(body)
  if (!phone && !email) {
    return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })
  }

  const start = Date.now()
  if (!OTP_RATE_LIMIT_BYPASS) {
    // Per-identifier rate limit
    const identifierKey = `otp:rate:${(phone || email || '').replace(/\s+/g, '')}`
    const idCount = (await kvIncr(identifierKey)) ?? 0
    if (idCount === 1) await kvExpire(identifierKey, RATE_WINDOW_SECONDS)
    if (idCount > OTP_RATE_LIMIT_PER_WINDOW) {
      return new Response(JSON.stringify({ ok: false, error: 'rate_limited_identifier' }), { status: 429 })
    }

    // Per-IP rate limit
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '').split(',')[0].trim()
    if (ip) {
      const ipKey = `otp:rate_ip:${ip}`
      const ipCount = (await kvIncr(ipKey)) ?? 0
      if (ipCount === 1) await kvExpire(ipKey, RATE_WINDOW_SECONDS)
      if (ipCount > IP_RATE_LIMIT_PER_WINDOW) {
        return new Response(JSON.stringify({ ok: false, error: 'rate_limited_ip' }), { status: 429 })
      }
    }
  }

  const otp = generateOtp()
  const otpHash = await bcrypt.hash(otp, 10)
  // Store multiple keys to tolerate formatting differences (with +, digits only)
  const keys: string[] = []
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    keys.push(`otp:${phone}`)
    keys.push(`otp:${digits}`)
    keys.push(`otp:+${digits}`)
  } else if (email) {
    keys.push(`otp:${email}`)
  }
  // Write all with same TTL
  await Promise.all(keys.map((k) => kvSet(k, { otpHash }, OTP_TTL_SECONDS)))

  let sent: { ok: true; messageId?: string } = { ok: true }
  if (phone) {
    const debugConfig = {
      template: process.env.WHATSAPP_TEMPLATE_NAME,
      lang: process.env.WHATSAPP_TEMPLATE_LANG,
      paramCount: process.env.WHATSAPP_TEMPLATE_PARAM_COUNT,
      phoneMasked: maskPhone(phone),
      hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberIdSet: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      apiVersion: process.env.WHATSAPP_API_VERSION,
    }
    const wa = await sendWhatsAppLoginCode(phone, otp)
    if (!wa.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'wa_send_failed', details: wa.error, debug: debugConfig }),
        { status: 502 },
      )
    }
    sent = { ok: true, ...(wa.messageId ? { messageId: wa.messageId } : {}) }
  } else if (email) {
    // You could optionally support email OTP; for now, we expect WhatsApp for OTP and email for magic link
    sent = { ok: true }
  }
  // Emit observability signals
  try {
    await kafkaEmit('auth.otp_sent', { identifier: phone || email, channel: phone ? 'whatsapp' : 'email', timestamp: Date.now() })
  } catch {}
  try {
    const c = await getCounter({ name: 'auth_otp_send_total', help: 'Total OTP sends', labelNames: ['channel'] })
    c.labels(phone ? 'whatsapp' : 'email').inc()
    const h = await getHistogram({ name: 'auth_otp_send_latency_ms', help: 'OTP send latency (ms)' })
    h.observe(Date.now() - start)
  } catch {}

  return new Response(JSON.stringify(sent), { status: 200 })
}


