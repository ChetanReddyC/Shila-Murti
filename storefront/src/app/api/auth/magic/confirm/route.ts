import type { NextRequest } from 'next/server'
import { kvGet, kvDel, kvSet } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter } from '@/lib/metrics'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const email = (searchParams.get('email') || '').toLowerCase()
  if (!token || !email) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_params' }), { status: 400 })
  }

  const record = await kvGet<{ tokenHash: string }>(`magic:${email}`)
  if (!record?.tokenHash) return new Response(JSON.stringify({ ok: false, error: 'expired_or_missing' }), { status: 400 })
  const ok = await bcrypt.compare(token, record.tokenHash)
  if (!ok) return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), { status: 400 })

  await kvDel(`magic:${email}`) // single-use
  // Mark verified so status can detect completion explicitly (avoid false positives)
  try { await kvSet(`magic:ok:${email}`, 1, 5 * 60) } catch {}
  try { await kafkaEmit('auth.combo_mfa_passed', { identifier: email, factor: 'magic', timestamp: Date.now() }) } catch {}
  try { const c = await getCounter({ name: 'auth_magic_confirm_success_total', help: 'Magic confirm success total' }); c.inc() } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}


