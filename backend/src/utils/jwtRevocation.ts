import { Modules } from "@medusajs/framework/utils"

const REVOCATION_PREFIX = "jwt:revoked:"
const REVOCATION_TTL = 3600 // 1 hour in seconds

/**
 * Revoke a JWT token by storing its jti (JWT ID) in Redis
 * TTL matches token expiration to auto-cleanup
 */
export async function revokeToken(scope: any, jti: string, expiresIn: number = REVOCATION_TTL): Promise<void> {
  try {
    const cacheService = scope.resolve(Modules.CACHE)
    const key = `${REVOCATION_PREFIX}${jti}`
    await cacheService.set(key, "1", expiresIn)
    console.log('[JWT_REVOCATION] Token revoked:', { jti })
  } catch (error) {
    console.error('[JWT_REVOCATION] Failed to revoke token:', error)
    throw new Error('Token revocation failed')
  }
}

/**
 * Check if a JWT token has been revoked
 */
export async function isTokenRevoked(scope: any, jti: string): Promise<boolean> {
  try {
    const cacheService = scope.resolve(Modules.CACHE)
    const key = `${REVOCATION_PREFIX}${jti}`
    const result = await cacheService.get(key)
    return result !== null
  } catch (error) {
    console.error('[JWT_REVOCATION] Failed to check revocation status:', error)
    return false
  }
}

/**
 * Revoke all tokens for a specific customer
 * Useful for logout-all-devices or security incidents
 */
export async function revokeCustomerTokens(scope: any, customerId: string, expiresIn: number = REVOCATION_TTL): Promise<void> {
  try {
    const cacheService = scope.resolve(Modules.CACHE)
    const key = `${REVOCATION_PREFIX}customer:${customerId}`
    await cacheService.set(key, Date.now().toString(), expiresIn)
    console.log('[JWT_REVOCATION] All customer tokens revoked:', { customerId })
  } catch (error) {
    console.error('[JWT_REVOCATION] Failed to revoke customer tokens:', error)
    throw new Error('Customer token revocation failed')
  }
}

/**
 * Check if all tokens for a customer have been revoked after a specific timestamp
 */
export async function areCustomerTokensRevoked(scope: any, customerId: string, tokenIssuedAt: number): Promise<boolean> {
  try {
    const cacheService = scope.resolve(Modules.CACHE)
    const key = `${REVOCATION_PREFIX}customer:${customerId}`
    const revokedAt = await cacheService.get(key)
    if (!revokedAt) return false
    const revokedTimestamp = parseInt(revokedAt as string, 10)
    return tokenIssuedAt < revokedTimestamp
  } catch (error) {
    console.error('[JWT_REVOCATION] Failed to check customer revocation:', error)
    return false
  }
}
