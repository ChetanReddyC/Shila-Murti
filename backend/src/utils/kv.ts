// KV Store utility for session management
// Supports both Upstash Redis and Cloudflare KV

const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

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

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (useCloudflare()) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const res = await fetch(url, { 
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
      cache: 'no-store'
    })
    if (res.status === 404) return null
    if (!res.ok) {
      console.error('[KV] Cloudflare KV get failed:', res.status, res.statusText)
      throw new Error(`CF KV get failed ${res.status}`)
    }
    const text = await res.text()
    try { 
      return JSON.parse(text) as T 
    } catch { 
      return text as unknown as T 
    }
  }

  if (!KV_URL || !KV_TOKEN) {
    console.warn('[KV] No KV configuration found')
    return null
  }
  
  const url = `${KV_URL}/get/${encodeURIComponent(key)}`
  const res = await fetch(url, { 
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store'
  })
  if (res.status === 404) return null
  if (!res.ok) {
    console.error('[KV] Upstash get failed:', res.status, res.statusText)
    throw new Error(`KV get failed ${res.status}`)
  }
  const json = await res.json().catch(() => null)
  return (json?.result ?? null) as T | null
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
    if (!res.ok) {
      console.error('[KV] Cloudflare KV set failed:', res.status, res.statusText)
      throw new Error(`CF KV set failed ${res.status}`)
    }
    return
  }

  if (!KV_URL || !KV_TOKEN) {
    console.warn('[KV] No KV configuration found, skipping set')
    return
  }
  
  const url = `${KV_URL}/set/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${KV_TOKEN}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ value, nx: false, ex: ttlSeconds }),
  })
  if (!res.ok) {
    console.error('[KV] Upstash set failed:', res.status, res.statusText)
    throw new Error(`KV set failed ${res.status}`)
  }
}
