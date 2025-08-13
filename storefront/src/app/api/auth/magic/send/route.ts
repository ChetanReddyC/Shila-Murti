import type { NextRequest } from 'next/server'
import { kvSet } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter, getHistogram } from '@/lib/metrics'
import { sendMagicLink } from '@/lib/providers/email'
import bcrypt from 'bcryptjs'

const MAGIC_TTL_SECONDS = 10 * 60
const RATE_WINDOW_SECONDS = parseInt(process.env.MAGIC_RATE_LIMIT_WINDOW_SECONDS || '3600', 10)
const MAGIC_RATE_LIMIT_PER_WINDOW = parseInt(process.env.MAGIC_RATE_LIMIT_PER_WINDOW || '10', 10)

function generateToken(): string {
  // 32 bytes random-ish via UUID fallback; can switch to crypto.getRandomValues with encoding
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  const { email, state, phone } = await req.json().catch(() => ({}))
  if (!email || typeof email !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'email_required' }), { status: 400 })
  }
  const normalized = email.toLowerCase()
  // Basic identifier rate limit for magic link sends
  try {
    const { kvIncr, kvExpire } = await import('@/lib/kv')
    const rateKey = `magic:rate:${normalized}`
    const count = (await kvIncr(rateKey)) ?? 0
    if (count === 1) await kvExpire(rateKey, RATE_WINDOW_SECONDS)
    if (count > MAGIC_RATE_LIMIT_PER_WINDOW) {
      return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), { status: 429 })
    }
  } catch {}
  const token = generateToken()
  const tokenHash = await bcrypt.hash(token, 10)
  await kvSet(`magic:${normalized}`, { tokenHash, phonePrimary: typeof phone === 'string' ? phone : undefined }, MAGIC_TTL_SECONDS)
  const qs = new URLSearchParams({ token, email: normalized })
  if (state && typeof state === 'string') qs.set('state', state)
  const url = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/auth/magic/confirm?${qs.toString()}`
  const res = await sendMagicLink(normalized, url)
  if (!res.ok) {
    console.error('[MAGIC SEND] failed', { email: normalized, error: res.error })
    return new Response(JSON.stringify({ ok: false, error: 'email_send_failed', details: res.error }), { status: 502 })
  }
  try {
    await kafkaEmit('auth.magiclink_sent', { email: normalized, timestamp: Date.now() })
  } catch {}
  try {
    const c = await getCounter({ name: 'auth_magic_send_total', help: 'Total magic link sends' })
    c.inc()
    const h = await getHistogram({ name: 'auth_magic_send_latency_ms', help: 'Magic link send latency (ms)' })
    h.observe(Date.now() - start)
  } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}


