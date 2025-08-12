import type { NextRequest } from 'next/server'
import { kvGet, kvListKeys, kvProvider } from '@/lib/kv'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') || ''
  const prefix = searchParams.get('prefix') || ''
  const list = searchParams.get('list') === '1'
  try {
    if (list) {
      const keys = await kvListKeys(prefix || 'otp:')
      return new Response(JSON.stringify({ ok: true, provider: kvProvider(), keys }), { status: 200 })
    }
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_key' }), { status: 400 })
    }
    const val = await kvGet(key)
    return new Response(JSON.stringify({ ok: true, key, value: val }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'error' }), { status: 500 })
  }
}


