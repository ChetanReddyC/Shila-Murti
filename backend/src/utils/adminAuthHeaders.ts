const SECRET_KEY_PREFIXES = [
  /^sk_[a-z0-9]+/i,
  /^tsk_[a-z0-9]+/i,
]

function isSecretKey(token: string): boolean {
  return SECRET_KEY_PREFIXES.some((pattern) => pattern.test(token))
}

export function buildAdminAuthHeaders(
  token?: string | null,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders }

  if (!token) {
    return headers
  }

  const trimmed = token.trim()
  if (!trimmed) {
    return headers
  }

  if (isSecretKey(trimmed)) {
    headers['x-medusa-api-key'] = trimmed
    headers['Authorization'] = `Bearer ${trimmed}`
  } else {
    headers['x-medusa-access-token'] = trimmed
    headers['Authorization'] = `Bearer ${trimmed}`
  }

  return headers
}
