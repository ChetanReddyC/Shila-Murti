// Cloudflare KV config (sole provider)
const CF_ACCOUNT_ID = process.env.CF_KV_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_KV_API_TOKEN

function useCloudflare(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN)
}

export function kvProvider(): 'cloudflare' | 'none' {
  if (useCloudflare()) return 'cloudflare'
  return 'none'
}

// Log KV provider on module load (server-side only)
if (typeof window === 'undefined') {
  const provider = kvProvider()
  console.log(`[KV] Provider: ${provider}`)
  if (provider === 'none') {
    console.warn('[KV] WARNING: No KV provider configured. Magic link verification will NOT work!')
  }
}

function cfUrl(key: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
}

function cfHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${CF_API_TOKEN}` }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!useCloudflare()) return

  const actualTTL = ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : 60
  const base = cfUrl(key)
  const url = ttlSeconds ? `${base}?expiration_ttl=${actualTTL}` : base

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...cfHeaders(), 'Content-Type': 'text/plain' },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })
  if (!res.ok) throw new Error(`CF KV set failed ${res.status}`)
}

/**
 * Atomic SET if Not eXists (NX) operation for distributed locking.
 * Cloudflare KV does not support true atomic NX — uses check-then-set.
 * Returns true if key was set, false if key already exists.
 *
 * Note: Cloudflare KV requires minimum TTL of 60 seconds.
 */
export async function kvSetNX(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  if (!useCloudflare()) {
    throw new Error('KV store not configured. Cannot acquire distributed lock. Set CF_KV_* environment variables.')
  }

  const existing = await kvGet(key)
  if (existing !== null) return false

  const actualTTL = ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : 60
  const url = `${cfUrl(key)}?expiration_ttl=${actualTTL}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...cfHeaders(), 'Content-Type': 'text/plain' },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error')
    throw new Error(`CF KV setNX failed ${res.status}: ${errorText}`)
  }
  return true
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (!useCloudflare()) return null

  const res = await fetch(cfUrl(key), { cache: 'no-store', headers: cfHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`CF KV get failed ${res.status}`)

  const text = await res.text()
  try { return JSON.parse(text) as T } catch { return text as unknown as T }
}

export async function kvDel(key: string): Promise<void> {
  if (!useCloudflare()) return

  const res = await fetch(cfUrl(key), { method: 'DELETE', headers: cfHeaders() })
  if (!res.ok && res.status !== 404) throw new Error(`CF KV del failed ${res.status}`)
}

export async function kvIncr(key: string): Promise<number | null> {
  if (!useCloudflare()) return null

  // Non-atomic read-modify-write (Cloudflare KV limitation)
  const current = await kvGet<string | number | null>(key)
  const n = (typeof current === 'number' ? current : parseInt(String(current || '0'), 10)) || 0
  const next = n + 1
  await kvSet(key, String(next))
  return next
}

export async function kvExpire(key: string, ttlSeconds: number): Promise<void> {
  if (!useCloudflare()) return

  const val = await kvGet<string>(key)
  if (val == null) return

  const url = `${cfUrl(key)}?expiration_ttl=${ttlSeconds}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...cfHeaders(), 'Content-Type': 'text/plain' },
    body: typeof val === 'string' ? val : JSON.stringify(val),
  })
  if (!res.ok) throw new Error(`CF KV expire failed ${res.status}`)
}

export async function kvListKeys(prefix = '', limit = 1000): Promise<string[]> {
  if (!useCloudflare()) return []

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
  const res = await fetch(url, { cache: 'no-store', headers: cfHeaders() })
  if (!res.ok) throw new Error(`CF KV list failed ${res.status}`)

  const json = await res.json().catch(() => null) as any
  const result = Array.isArray(json?.result) ? json.result : []
  return result.map((k: any) => String(k?.name)).filter(Boolean)
}
