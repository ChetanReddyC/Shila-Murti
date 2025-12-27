/**
 * Hybrid KV Store Strategy
 * 
 * Uses the best KV store for each use case:
 * - Upstash Redis: Distributed locks, atomic operations (critical path)
 * - Cloudflare KV: Sessions, caching, general storage (non-critical)
 */

// Upstash Redis config (for atomic operations)
const UPSTASH_URL = process.env.KV_REST_API_URL
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN

// Cloudflare KV config (for general storage)
const CF_ACCOUNT_ID = process.env.CF_KV_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_KV_API_TOKEN

/**
 * Check which providers are available
 */
export function getAvailableProviders(): {
  upstash: boolean
  cloudflare: boolean
  recommended: 'upstash' | 'cloudflare' | 'none'
} {
  const upstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN)
  const cloudflare = Boolean(CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN)

  let recommended: 'upstash' | 'cloudflare' | 'none' = 'none'
  if (upstash) recommended = 'upstash' // Prefer Upstash for atomic ops
  else if (cloudflare) recommended = 'cloudflare' // Fallback to Cloudflare

  return { upstash, cloudflare, recommended }
}

/**
 * Atomic SET NX for distributed locks
 * REQUIRES Upstash Redis for true atomicity
 */
export async function kvSetNXAtomic(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  // If Upstash is not configured, fall back to check-then-set (less atomic but works for dev)
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('[KV_HYBRID][kvSetNXAtomic] Upstash not configured - falling back to Cloudflare KV check-then-set (NOT ATOMIC)')

    // Check if key exists using Cloudflare KV
    const existing = await kvGet(key)
    if (existing !== null) {
      return false // Key already exists
    }

    // Key doesn't exist, set it
    await kvSet(key, value, ttlSeconds)
    return true
  }

  console.log('[KV_HYBRID][kvSetNXAtomic] Attempting atomic SET NX', {
    key,
    upstashUrl: UPSTASH_URL.substring(0, 30) + '...',
    hasToken: Boolean(UPSTASH_TOKEN),
    ttlSeconds
  })

  // CRITICAL FIX: Upstash requires using the SETNX command, not SET with nx flag
  // We need to use pipeline to do SETNX + EXPIRE atomically

  if (ttlSeconds) {
    // Use Redis pipeline for atomic SETNX + EXPIRE
    const pipelineUrl = `${UPSTASH_URL}/pipeline`
    const commands = [
      ['SETNX', key, typeof value === 'string' ? value : JSON.stringify(value)],
      ['EXPIRE', key, ttlSeconds]
    ]

    console.log('[KV_HYBRID][kvSetNXAtomic] Using pipeline for SETNX + EXPIRE')

    const res = await fetch(pipelineUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
    })

    console.log('[KV_HYBRID][kvSetNXAtomic] Response status:', res.status)

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[KV_HYBRID][kvSetNXAtomic] Request failed:', errorText)
      throw new Error(`Upstash pipeline failed ${res.status}: ${errorText}`)
    }

    const json = await res.json().catch(() => null)
    console.log('[KV_HYBRID][kvSetNXAtomic] Response JSON:', json)

    // Pipeline returns array: [SETNX result, EXPIRE result]
    // SETNX returns 1 if key was set, 0 if key already existed
    const setnxResult = json?.[0]?.result
    const acquired = setnxResult === 1

    console.log('[KV_HYBRID][kvSetNXAtomic] Lock acquired:', acquired, 'SETNX result:', setnxResult)

    return acquired

  } else {
    // No TTL - just use SETNX directly
    const url = `${UPSTASH_URL}/setnx/${encodeURIComponent(key)}/${encodeURIComponent(
      typeof value === 'string' ? value : JSON.stringify(value)
    )}`

    console.log('[KV_HYBRID][kvSetNXAtomic] Using simple SETNX')

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    console.log('[KV_HYBRID][kvSetNXAtomic] Response status:', res.status)

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[KV_HYBRID][kvSetNXAtomic] Request failed:', errorText)
      throw new Error(`Upstash setnx failed ${res.status}: ${errorText}`)
    }

    const json = await res.json().catch(() => null)
    console.log('[KV_HYBRID][kvSetNXAtomic] Response JSON:', json)

    // SETNX returns 1 if key was set, 0 if key already existed
    const acquired = json?.result === 1
    console.log('[KV_HYBRID][kvSetNXAtomic] Lock acquired:', acquired, 'result:', json?.result)

    return acquired
  }
}

/**
 * Regular SET - works with either provider
 * Uses Upstash if available, falls back to Cloudflare
 */
export async function kvSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  // Try Upstash first (if available)
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}`
    const body: any = { value }
    if (ttlSeconds) body.ex = ttlSeconds

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    })

    if (res.ok) return
  }

  // Fallback to Cloudflare KV
  if (CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN) {
    // Cloudflare requires minimum 60s TTL
    const actualTTL = ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : 60

    const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const url = ttlSeconds ? `${base}?expiration_ttl=${actualTTL}` : base

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: typeof value === 'string' ? value : JSON.stringify(value),
    })

    if (res.ok) return
  }

  console.warn('[KV_HYBRID] No KV store available for key:', key)
}

/**
 * GET - works with either provider
 */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  // Try Upstash first (if available and key might be there)
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })

    if (res.ok) {
      const json = await res.json().catch(() => null)
      const result = json?.result
      if (result !== null) return result as T
    }
  }

  // Try Cloudflare KV
  if (CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
    })

    if (res.status === 404) return null
    if (res.ok) {
      const text = await res.text()
      try { return JSON.parse(text) as T }
      catch { return text as unknown as T }
    }
  }

  return null
}

/**
 * DELETE - works with either provider
 */
export async function kvDel(key: string): Promise<void> {
  // Delete from both stores (if available)
  const promises: Promise<any>[] = []

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const url = `${UPSTASH_URL}/del/${encodeURIComponent(key)}`
    promises.push(
      fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
    )
  }

  if (CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    promises.push(
      fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
      })
    )
  }

  await Promise.allSettled(promises)
}

/**
 * INCREMENT - requires Upstash
 */
export async function kvIncr(key: string): Promise<number | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('[KV_HYBRID] Increment requires Upstash Redis')
    return null
  }

  const url = `${UPSTASH_URL}/incr/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  })

  if (!res.ok) return null

  const json = await res.json().catch(() => null)
  return json?.result ?? null
}
