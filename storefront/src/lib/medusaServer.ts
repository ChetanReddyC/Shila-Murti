export type StoreFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  bearerToken?: string | null
}

export function getStoreBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL ||
    process.env.MEDUSA_BASE_URL ||
    'http://localhost:9000'
  )
}

export async function storeFetch(path: string, init: StoreFetchInit = {}): Promise<Response> {
  const base = getStoreBaseUrl()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers || {}),
  }
  if (init.bearerToken) headers['Authorization'] = `Bearer ${init.bearerToken}`
  const res = await fetch(`${base}${path}`, { ...init, headers })
  return res
}


