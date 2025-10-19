// Upstash REST config
const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

// Cloudflare KV config
const CF_ACCOUNT_ID = process.env.CF_KV_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_KV_API_TOKEN

function useCloudflare(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN)
}

export function kvProvider(): 'cloudflare' | 'upstash' | 'none' {
  if (useCloudflare()) return 'cloudflare'
  if (KV_URL && KV_TOKEN) return 'upstash'
  return 'none'
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (useCloudflare()) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const url = ttlSeconds ? `${base}?expiration_ttl=${ttlSeconds}` : base
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: typeof value === 'string' ? value : JSON.stringify(value),
    })
    if (!res.ok) throw new Error(`CF KV set failed ${res.status}`)
    return
  }

  if (!KV_URL || !KV_TOKEN) return
  const url = `${KV_URL}/set/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, nx: false, ex: ttlSeconds }),
  })
  if (!res.ok) throw new Error(`KV set failed ${res.status}`)
}

/**
 * Atomic SET if Not eXists (NX) operation for distributed locking
 * Returns true if key was set, false if key already exists
 * Throws error if no KV store is configured
 * 
 * Note: Cloudflare KV requires minimum TTL of 60 seconds
 */
export async function kvSetNX(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  if (useCloudflare()) {
    // Cloudflare KV doesn't support atomic NX, so we simulate with get-then-set
    // This is NOT truly atomic but better than nothing for Cloudflare
    const existing = await kvGet(key)
    if (existing !== null) return false
    
    // Cloudflare KV requires minimum TTL of 60 seconds
    const actualTTL = ttlSeconds && ttlSeconds >= 60 ? ttlSeconds : 60
    
    const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const url = `${base}?expiration_ttl=${actualTTL}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: typeof value === 'string' ? value : JSON.stringify(value),
    })
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`CF KV setNX failed ${res.status}: ${errorText}`)
    }
    return true
  }

  if (KV_URL && KV_TOKEN) {
    // Upstash Redis supports atomic SET NX EX
    const url = `${KV_URL}/set/${encodeURIComponent(key)}`
    const body: any = { value, nx: true }
    if (ttlSeconds) body.ex = ttlSeconds
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`KV setNX failed ${res.status}: ${errorText}`)
    }
    
    const json = await res.json().catch(() => null)
    // Upstash returns { result: "OK" } on success, { result: null } if key exists
    return json?.result === 'OK'
  }
  
  // No KV store configured - critical error
  throw new Error('KV store not configured. Cannot acquire distributed lock. Set CF_KV_* or KV_REST_API_* environment variables.')
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (useCloudflare()) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`CF KV get failed ${res.status}`)
    const text = await res.text()
    try { return JSON.parse(text) as T } catch { return text as unknown as T }
  }

  if (!KV_URL || !KV_TOKEN) return null
  const url = `${KV_URL}/get/${encodeURIComponent(key)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`KV get failed ${res.status}`)
  const json = await res.json().catch(() => null)
  return (json?.result ?? null) as T | null
}

export async function kvDel(key: string): Promise<void> {
  if (useCloudflare()) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${CF_API_TOKEN}` } })
    if (!res.ok && res.status !== 404) throw new Error(`CF KV del failed ${res.status}`)
    return
  }

  if (!KV_URL || !KV_TOKEN) return
  const url = `${KV_URL}/del/${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${KV_TOKEN}` } })
  if (!res.ok && res.status !== 404) throw new Error(`KV del failed ${res.status}`)
}

export async function kvIncr(key: string): Promise<number | null> {
  if (useCloudflare()) {
    // Non-atomic approximation: read, increment, write back
    const current = await kvGet<string | number | null>(key)
    const n = (typeof current === 'number' ? current : parseInt(String(current || '0'), 10)) || 0
    const next = n + 1
    await kvSet(key, String(next))
    return next
  }

  if (!KV_URL || !KV_TOKEN) return null
  const url = `${KV_URL}/incr/${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` } })
  if (!res.ok) throw new Error(`KV incr failed ${res.status}`)
  const json = await res.json().catch(() => null)
  // Upstash returns { result: 1 }
  return (json as any)?.result ?? null
}

export async function kvExpire(key: string, ttlSeconds: number): Promise<void> {
  if (useCloudflare()) {
    const val = await kvGet<string>(key)
    if (val == null) return
    const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const url = `${base}?expiration_ttl=${ttlSeconds}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'text/plain' },
      body: typeof val === 'string' ? val : JSON.stringify(val),
    })
    if (!res.ok) throw new Error(`CF KV expire failed ${res.status}`)
    return
  }

  if (!KV_URL || !KV_TOKEN) return
  const url = `${KV_URL}/expire/${encodeURIComponent(key)}/${ttlSeconds}`
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` } })
  if (!res.ok) throw new Error(`KV expire failed ${res.status}`)
}

export async function kvListKeys(prefix = '', limit = 1000): Promise<string[]> {
  if (useCloudflare()) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } })
    if (!res.ok) throw new Error(`CF KV list failed ${res.status}`)
    const json = await res.json().catch(() => null) as any
    const result = Array.isArray(json?.result) ? json.result : []
    return result.map((k: any) => String(k?.name)).filter(Boolean)
  }
  // Upstash list not supported via this helper; return empty
  return []
}


