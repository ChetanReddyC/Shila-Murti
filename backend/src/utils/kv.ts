// KV Store utility for session management
// Supports both Upstash Redis and Cloudflare KV

const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

const CF_ACCOUNT_ID = process.env.CF_KV_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_KV_API_TOKEN

// Debug logging on startup
console.log('[KV] Initializing KV Store...', {
  hasCloudflareAccountId: !!CF_ACCOUNT_ID,
  hasCloudflareNamespaceId: !!CF_NAMESPACE_ID,
  hasCloudflareApiToken: !!CF_API_TOKEN,
  cloudflareAccountIdPrefix: CF_ACCOUNT_ID ? CF_ACCOUNT_ID.substring(0, 8) + '...' : 'NOT SET',
  cloudflareNamespaceIdPrefix: CF_NAMESPACE_ID ? CF_NAMESPACE_ID.substring(0, 8) + '...' : 'NOT SET',
  hasUpstashUrl: !!KV_URL,
  hasUpstashToken: !!KV_TOKEN,
})

function useCloudflare(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN)
}

export function kvProvider(): 'cloudflare' | 'upstash' | 'none' {
  if (useCloudflare()) return 'cloudflare'
  if (KV_URL && KV_TOKEN) return 'upstash'
  return 'none'
}

// Log which provider is being used
console.log('[KV] KV Provider selected:', kvProvider())

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

    console.log('[KV] Cloudflare KV SET attempting:', {
      key: key.substring(0, 30) + '...',
      ttlSeconds,
      accountIdPrefix: CF_ACCOUNT_ID?.substring(0, 8),
      namespaceIdPrefix: CF_NAMESPACE_ID?.substring(0, 8)
    })

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: typeof value === 'string' ? value : JSON.stringify(value),
    })
    if (!res.ok) {
      // Get detailed error response
      const errorBody = await res.text().catch(() => 'Could not read error body')
      console.error('[KV] Cloudflare KV set failed:', {
        status: res.status,
        statusText: res.statusText,
        errorBody: errorBody,
        url: url.replace(CF_API_TOKEN || '', '***'),
      })
      throw new Error(`CF KV set failed ${res.status}: ${errorBody}`)
    }
    console.log('[KV] Cloudflare KV SET success:', key.substring(0, 30) + '...')
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

export async function kvDel(key: string): Promise<void> {
  if (useCloudflare()) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
    })
    if (!res.ok && res.status !== 404) {
      console.error('[KV] Cloudflare KV del failed:', res.status, res.statusText)
      throw new Error(`CF KV del failed ${res.status}`)
    }
    return
  }

  if (!KV_URL || !KV_TOKEN) {
    console.warn('[KV] No KV configuration found, skipping delete')
    return
  }

  const url = `${KV_URL}/del/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  })
  if (!res.ok && res.status !== 404) {
    console.error('[KV] Upstash del failed:', res.status, res.statusText)
    throw new Error(`KV del failed ${res.status}`)
  }
}
