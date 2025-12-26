/**
 * Environment-aware base URL utility
 * 
 * This module provides a consistent way to get the application's base URL
 * that works correctly in both development and production environments.
 * 
 * The problem it solves:
 * - In production, NEXT_PUBLIC_URL should be https://shilamurti.com
 * - In development (localhost), it should be http://localhost:3000
 * - The same codebase should work in both environments without manual .env changes
 */

/**
 * Get the appropriate base URL for the current environment.
 * 
 * Priority:
 * 1. NEXT_PUBLIC_URL environment variable (if set to a localhost URL in dev)
 * 2. Auto-detection based on NODE_ENV
 * 3. Fallback to localhost:3000
 * 
 * @param req - Optional NextRequest to extract the host from request headers
 * @returns The base URL string
 */
export function getBaseUrl(req?: { headers: { get: (name: string) => string | null } }): string {
    // If we have a request object, use the host header (most reliable for server-side)
    if (req) {
        const host = req.headers.get('host')
        const protocol = req.headers.get('x-forwarded-proto') || 'http'
        if (host) {
            // Check if it's localhost
            if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
                return `http://${host}`
            }
            return `${protocol}://${host}`
        }
    }

    // Check if NEXT_PUBLIC_URL is explicitly set
    const envUrl = process.env.NEXT_PUBLIC_URL

    // In development mode, prefer localhost unless NEXT_PUBLIC_URL explicitly points to localhost
    if (process.env.NODE_ENV === 'development') {
        // If NEXT_PUBLIC_URL is set and points to localhost, use it
        if (envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
            return envUrl
        }
        // Otherwise, default to localhost for development
        return 'http://localhost:3000'
    }

    // In production or other environments, use NEXT_PUBLIC_URL or fallback
    return envUrl || 'http://localhost:3000'
}

/**
 * Get the base URL for magic link emails.
 * This is critical because the magic link needs to point to the correct environment.
 * 
 * For localhost development, the magic link should point to localhost.
 * For production, it should point to the production domain.
 * 
 * @param req - Optional NextRequest for server-side detection
 * @returns The base URL to use in magic link emails
 */
export function getMagicLinkBaseUrl(req?: { headers: { get: (name: string) => string | null } }): string {
    return getBaseUrl(req)
}

/**
 * Log the current environment configuration (for debugging)
 */
export function logEnvironmentConfig(): void {
    console.log('[ENV] Environment Configuration:', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
        resolvedBaseUrl: getBaseUrl(),
    })
}

// Log environment config on module load (server-side only)
if (typeof window === 'undefined') {
    logEnvironmentConfig()
}
