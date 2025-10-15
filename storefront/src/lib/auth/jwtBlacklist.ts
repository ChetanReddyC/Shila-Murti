import { kvSet, kvGet, kvDel } from '@/lib/kv';

const BLACKLIST_PREFIX = 'jwt:blacklist:';
const DEFAULT_TTL_SEC = 3600; // 1 hour (match session maxAge)

/**
 * Add a JWT token identifier (jti) to the blacklist
 */
export async function blacklistJWT(jti: string, ttlSec: number = DEFAULT_TTL_SEC): Promise<void> {
  if (!jti) {
    throw new Error('JWT identifier (jti) is required');
  }
  
  const key = `${BLACKLIST_PREFIX}${jti}`;
  await kvSet(key, 'revoked', ttlSec);
}

/**
 * Check if a JWT token identifier (jti) is blacklisted
 */
export async function isJWTBlacklisted(jti: string): Promise<boolean> {
  if (!jti) {
    return false;
  }
  
  const key = `${BLACKLIST_PREFIX}${jti}`;
  const value = await kvGet(key);
  return value === 'revoked';
}

/**
 * Remove a JWT from the blacklist (for manual cleanup if needed)
 */
export async function unblacklistJWT(jti: string): Promise<void> {
  if (!jti) {
    return;
  }
  
  const key = `${BLACKLIST_PREFIX}${jti}`;
  await kvDel(key);
}
