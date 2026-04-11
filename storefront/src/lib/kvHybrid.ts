/**
 * Hybrid KV Store — Cloudflare KV only
 *
 * All atomic operations (SETNX for locks) use Cloudflare KV with
 * a check-then-set pattern.  True Redis-level atomicity is not
 * available, but the TTL-guarded window is small enough for our
 * single-writer completion flow.
 */

const CF_ACCOUNT_ID = process.env.CF_KV_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_KV_API_TOKEN

function cfConfigured(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN)
}

if (typeof window === 'undefined') {
  console.log('[KV_HYBRID] Config:', {
    cloudflare: cfConfigured() ? 'configured' : 'NOT configured',
  })
}

// ── helpers ──────────────────────────────────────────────────────────

function cfUrl(key: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
}

function cfHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${CF_API_TOKEN}` }
}

// ── public API ───────────────────────────────────────────────────────

/**
 * Atomic-ish SET NX for distributed locks.
 * Uses Cloudflare KV check-then-set (best available without Redis).
 */
export async function kvSetNXAtomic(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  if (!cfConfigured()) {
    throw new Error('Cloudflare KV not configured — cannot acquire lock')
  }

  // Check if key already exists
  const existing = await kvGet(key)
  if (existing !== null) return false

  // Cloudflare KV minimum TTL is 60s
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

export function getAvailableProviders() {
  return {
    upstash: false,
    cloudflare: cfConfigured(),
    recommended: cfConfigured() ? 'cloudflare' as const : 'none' as const,
  }
}

/** SET */
export async function kvSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  if (!cfConfigured()) {
    console.warn('[KV_HYBRID] No KV store available for key:', key)
    return
  }

  const actualTTL = ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : 60
  const url = ttlSeconds ? `${cfUrl(key)}?expiration_ttl=${actualTTL}` : cfUrl(key)

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...cfHeaders(), 'Content-Type': 'text/plain' },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`CF KV set failed ${res.status}: ${errorText}`)
  }
}

/** GET */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (!cfConfigured()) return null

  const res = await fetch(cfUrl(key), {
    cache: 'no-store',
    headers: cfHeaders(),
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`CF KV get failed ${res.status}`)

  const text = await res.text()
  try { return JSON.parse(text) as T }
  catch { return text as unknown as T }
}

/** DELETE */
export async function kvDel(key: string): Promise<void> {
  if (!cfConfigured()) return

  const res = await fetch(cfUrl(key), {
    method: 'DELETE',
    headers: cfHeaders(),
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`CF KV del failed ${res.status}`)
  }
}

/** INCREMENT (non-atomic read-modify-write) */
export async function kvIncr(key: string): Promise<number | null> {
  if (!cfConfigured()) return null

  const current = await kvGet<string | number | null>(key)
  const n = (typeof current === 'number' ? current : parseInt(String(current || '0'), 10)) || 0
  const next = n + 1
  await kvSet(key, String(next))
  return next
}
