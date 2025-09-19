import type { NextRequest } from 'next/server'
import { kvGet, kvDel, kvSet } from '@/lib/kv'
import { kafkaEmit } from '@/lib/kafka'
import { getCounter } from '@/lib/metrics'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const email = (searchParams.get('email') || '').toLowerCase()
  const state = searchParams.get('state') || ''
  if (!token || !email) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_params' }), { status: 400 })
  }

  const record = await kvGet<{ tokenHash: string; phonePrimary?: string; cartId?: string }>(`magic:${email}`)
  if (!record?.tokenHash) return new Response(JSON.stringify({ ok: false, error: 'expired_or_missing' }), { status: 400 })
  const ok = await bcrypt.compare(token, record.tokenHash)
  if (!ok) return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), { status: 400 })

  await kvDel(`magic:${email}`) // single-use
  // Mark verified with explicit state binding when provided
  try { await kvSet(`magic:ok:${email}${state ? `:${state}` : ''}`, 1, 5 * 60) } catch {}
  try { await kafkaEmit('auth.combo_mfa_passed', { identifier: email, factor: 'magic', timestamp: Date.now() }) } catch {}
  try { const c = await getCounter({ name: 'auth_magic_confirm_success_total', help: 'Magic confirm success total' }); c.inc() } catch {}

  // Smart redirect based on context
  const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  
  // If this is a checkout flow, redirect directly to checkout page
  if (state?.startsWith('checkout-')) {
    // Use cart ID from record (more reliable) or fallback to state
    const cartId = record?.cartId || state.replace('checkout-', '')
    const checkoutUrl = `${base}/checkout?verified=true&email=${encodeURIComponent(email)}${cartId ? `&cartId=${encodeURIComponent(cartId)}` : ''}${record?.phonePrimary ? `&phone=${encodeURIComponent(record.phonePrimary)}` : ''}`
    return new Response(null, { status: 302, headers: { Location: checkoutUrl } })
  }
  
  // For regular login flows, redirect to the new welcome page
  const welcomeUrl = `${base}/welcome?email=${encodeURIComponent(email)}${record?.phonePrimary ? `&phone=${encodeURIComponent(record.phonePrimary)}` : ''}${state ? `&state=${encodeURIComponent(state)}` : ''}`
  return new Response(null, { status: 302, headers: { Location: welcomeUrl } })
}


