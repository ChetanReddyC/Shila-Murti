import type { NextRequest } from 'next/server'
import { kvIncr, kvExpire } from '@/lib/kv'

export async function enforceRateLimit(key: string, max: number, windowSeconds: number): Promise<{ ok: boolean; count?: number }> {
  const count = (await kvIncr(key)) ?? 0
  if (count === 1) {
    await kvExpire(key, windowSeconds)
  }
  if (count > max) {
    return { ok: false, count }
  }
  return { ok: true, count }
}

export function getClientIp(req: Request | NextRequest): string | null {
  const h = 'headers' in req ? req.headers : null
  const raw = h?.get('x-forwarded-for') || h?.get('cf-connecting-ip') || h?.get('x-real-ip') || ''
  const first = raw.split(',')[0]?.trim()
  return first || null
}

export async function enforceIpRateLimit(req: Request | NextRequest, prefix: string, max: number, windowSeconds: number): Promise<{ ok: boolean; count?: number }> {
  const ip = getClientIp(req)
  if (!ip) return { ok: true }
  return enforceRateLimit(`${prefix}:${ip}`, max, windowSeconds)
}


