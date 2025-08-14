'use client';

// Session storage key for order confirmation protection flag
export const ORDER_CONFIRMATION_ACTIVE_KEY = 'order_confirmation_active';

// Default TTL: 30 seconds
export const DEFAULT_TTL_MS = 30_000;

/**
 * Returns the expiration timestamp (ms since epoch) for the active protection flag, or null if not set/invalid.
 * Also performs cleanup if the flag has expired.
 */
export function getOrderConfirmationProtectionExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ORDER_CONFIRMATION_ACTIVE_KEY);
    if (!raw) return null;
    const expiresAt = parseInt(raw, 10);
    if (!Number.isFinite(expiresAt)) {
      sessionStorage.removeItem(ORDER_CONFIRMATION_ACTIVE_KEY);
      return null;
    }
    if (expiresAt > Date.now()) {
      return expiresAt;
    }
    sessionStorage.removeItem(ORDER_CONFIRMATION_ACTIVE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks whether the order confirmation protection flag is currently active (not expired).
 */
export function isOrderConfirmationProtectionActive(): boolean {
  const expiry = getOrderConfirmationProtectionExpiry();
  return typeof expiry === 'number' && expiry > Date.now();
}

/**
 * Sets or clears the order confirmation protection flag.
 * When activating, stores an expiry based on the provided TTL (defaults to 30s).
 */
export function setOrderConfirmationProtection(active: boolean, ttlMs: number = DEFAULT_TTL_MS): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      const expiry = Date.now() + Math.max(0, Number(ttlMs || 0));
      sessionStorage.setItem(ORDER_CONFIRMATION_ACTIVE_KEY, String(expiry));
    } else {
      sessionStorage.removeItem(ORDER_CONFIRMATION_ACTIVE_KEY);
    }
  } catch {
    // Swallow
  }
}

/**
 * Clears the order confirmation protection flag explicitly.
 */
export function clearOrderConfirmationProtection(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ORDER_CONFIRMATION_ACTIVE_KEY);
  } catch {
    // Swallow
  }
}


