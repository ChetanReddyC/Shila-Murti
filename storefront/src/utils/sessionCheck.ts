/**
 * Utility to check if API response indicates session expiry
 * Returns true if session expired, false otherwise
 */
export function checkSessionExpired(response: Response, data: any): boolean {
  if (response.status === 401 && data?.error === 'session_expired') {
    return true
  }
  return false
}

/**
 * Handle session expiry by redirecting to login
 */
export function handleSessionExpiry(router: any, context: string = 'API') {
  console.log(`[${context}] Session expired, redirecting to login`)
  router.push('/login')
}
