/**
 * KV Store Service
 * 
 * Production-grade key-value store abstraction with:
 * - Primary: Cloudflare Workers KV
 * - Fallback: Upstash Redis
 * - Circuit breaker pattern for failure detection
 * - Automatic recovery attempts
 * - Request timeouts
 * - Structured logging
 */

// ============================================================================
// Configuration
// ============================================================================

interface KVConfig {
  cloudflare: {
    accountId: string | undefined
    namespaceId: string | undefined
    apiToken: string | undefined
  }
  upstash: {
    url: string | undefined
    token: string | undefined
  }
  timeoutMs: number
  circuitBreaker: {
    failureThreshold: number
    recoveryTimeMs: number
  }
}

const config: KVConfig = {
  cloudflare: {
    accountId: process.env.CF_KV_ACCOUNT_ID,
    namespaceId: process.env.CF_KV_NAMESPACE_ID,
    apiToken: process.env.CF_KV_API_TOKEN,
  },
  upstash: {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  },
  timeoutMs: 8000, // 8 second timeout
  circuitBreaker: {
    failureThreshold: 2,    // Switch to fallback after 2 consecutive failures
    recoveryTimeMs: 60000,  // Try primary again after 1 minute
  },
}

// ============================================================================
// Types
// ============================================================================

type KVProvider = 'cloudflare' | 'upstash' | 'none'

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  isOpen: boolean
}

// ============================================================================
// Circuit Breaker State
// ============================================================================

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
}

// ============================================================================
// Provider Detection
// ============================================================================

function isCloudflareConfigured(): boolean {
  const { accountId, namespaceId, apiToken } = config.cloudflare
  return Boolean(accountId && namespaceId && apiToken)
}

function isUpstashConfigured(): boolean {
  const { url, token } = config.upstash
  return Boolean(url && token)
}

function shouldUseCloudflare(): boolean {
  if (!isCloudflareConfigured()) return false
  if (!circuitBreaker.isOpen) return true

  // Check if recovery time has passed
  const timeSinceFailure = Date.now() - circuitBreaker.lastFailure
  if (timeSinceFailure >= config.circuitBreaker.recoveryTimeMs) {
    console.log('[KV] Circuit breaker: Attempting recovery to Cloudflare')
    return true
  }

  return false
}

export function kvProvider(): KVProvider {
  if (shouldUseCloudflare()) return 'cloudflare'
  if (isUpstashConfigured()) return 'upstash'
  return 'none'
}

// ============================================================================
// Circuit Breaker Logic
// ============================================================================

function recordSuccess(): void {
  if (circuitBreaker.isOpen) {
    console.log('[KV] Circuit breaker: Cloudflare recovered, closing circuit')
  }
  circuitBreaker.failures = 0
  circuitBreaker.isOpen = false
}

function recordFailure(error: Error): void {
  circuitBreaker.failures++
  circuitBreaker.lastFailure = Date.now()

  console.error('[KV] Cloudflare failure:', {
    error: error.message,
    consecutiveFailures: circuitBreaker.failures,
    threshold: config.circuitBreaker.failureThreshold,
  })

  if (circuitBreaker.failures >= config.circuitBreaker.failureThreshold) {
    if (!circuitBreaker.isOpen) {
      circuitBreaker.isOpen = true
      console.warn('[KV] ⚠️ Circuit breaker OPEN: Switching to Upstash fallback')
    }
  }
}

// ============================================================================
// HTTP Helpers
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = config.timeoutMs
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============================================================================
// Cloudflare KV Operations
// ============================================================================

async function cloudflareGet<T>(key: string): Promise<T | null> {
  const { accountId, namespaceId, apiToken } = config.cloudflare
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Cloudflare GET failed: ${res.status} ${res.statusText}`)
  }

  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

async function cloudflareSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const { accountId, namespaceId, apiToken } = config.cloudflare
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
  const url = ttlSeconds ? `${base}?expiration_ttl=${ttlSeconds}` : base

  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'text/plain',
    },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`Cloudflare SET failed: ${res.status} ${res.statusText} ${errorBody}`)
  }
}

async function cloudflareDel(key: string): Promise<void> {
  const { accountId, namespaceId, apiToken } = config.cloudflare
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`

  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiToken}` },
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Cloudflare DELETE failed: ${res.status} ${res.statusText}`)
  }
}

// ============================================================================
// Upstash Redis Operations
// ============================================================================

async function upstashGet<T>(key: string): Promise<T | null> {
  const { url: baseUrl, token } = config.upstash
  const url = `${baseUrl}/get/${encodeURIComponent(key)}`

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Upstash GET failed: ${res.status} ${res.statusText}`)
  }

  const json = await res.json().catch(() => null)
  return (json?.result ?? null) as T | null
}

async function upstashSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const { url: baseUrl, token } = config.upstash
  const url = `${baseUrl}/set/${encodeURIComponent(key)}`

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value, nx: false, ex: ttlSeconds }),
  })

  if (!res.ok) {
    throw new Error(`Upstash SET failed: ${res.status} ${res.statusText}`)
  }
}

async function upstashDel(key: string): Promise<void> {
  const { url: baseUrl, token } = config.upstash
  const url = `${baseUrl}/del/${encodeURIComponent(key)}`

  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Upstash DELETE failed: ${res.status} ${res.statusText}`)
  }
}

// ============================================================================
// Public API with Fallback Logic
// ============================================================================

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const provider = kvProvider()

  if (provider === 'cloudflare') {
    try {
      const result = await cloudflareGet<T>(key)
      recordSuccess()
      return result
    } catch (error) {
      recordFailure(error as Error)

      // Fallback to Upstash
      if (isUpstashConfigured()) {
        console.log('[KV] Falling back to Upstash for GET:', key.substring(0, 30) + '...')
        return upstashGet<T>(key)
      }
      throw error
    }
  }

  if (provider === 'upstash') {
    return upstashGet<T>(key)
  }

  console.warn('[KV] No KV provider configured')
  return null
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const provider = kvProvider()

  if (provider === 'cloudflare') {
    try {
      await cloudflareSet(key, value, ttlSeconds)
      recordSuccess()
      console.log('[KV] SET success (Cloudflare):', key.substring(0, 30) + '...')
      return
    } catch (error) {
      recordFailure(error as Error)

      // Fallback to Upstash
      if (isUpstashConfigured()) {
        console.log('[KV] Falling back to Upstash for SET:', key.substring(0, 30) + '...')
        await upstashSet(key, value, ttlSeconds)
        console.log('[KV] SET success (Upstash fallback):', key.substring(0, 30) + '...')
        return
      }
      throw error
    }
  }

  if (provider === 'upstash') {
    await upstashSet(key, value, ttlSeconds)
    console.log('[KV] SET success (Upstash):', key.substring(0, 30) + '...')
    return
  }

  console.warn('[KV] No KV provider configured, skipping SET')
}

export async function kvDel(key: string): Promise<void> {
  const provider = kvProvider()

  if (provider === 'cloudflare') {
    try {
      await cloudflareDel(key)
      recordSuccess()
      return
    } catch (error) {
      recordFailure(error as Error)

      // Fallback to Upstash
      if (isUpstashConfigured()) {
        console.log('[KV] Falling back to Upstash for DELETE:', key.substring(0, 30) + '...')
        return upstashDel(key)
      }
      throw error
    }
  }

  if (provider === 'upstash') {
    return upstashDel(key)
  }

  console.warn('[KV] No KV provider configured, skipping DELETE')
}

// ============================================================================
// Startup Logging
// ============================================================================

console.log('[KV] Service initialized:', {
  cloudflareConfigured: isCloudflareConfigured(),
  upstashConfigured: isUpstashConfigured(),
  activeProvider: kvProvider(),
  timeoutMs: config.timeoutMs,
  circuitBreakerThreshold: config.circuitBreaker.failureThreshold,
  recoveryTimeMs: config.circuitBreaker.recoveryTimeMs,
})

if (isCloudflareConfigured() && isUpstashConfigured()) {
  console.log('[KV] ✓ High availability mode: Upstash configured as fallback')
} else if (!isCloudflareConfigured() && !isUpstashConfigured()) {
  console.error('[KV] ⚠️ WARNING: No KV providers configured!')
}
