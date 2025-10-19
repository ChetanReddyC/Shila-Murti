import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { kvGet } from "../../utils/kv"

const CART_SESSION_COOKIE = 'cart_session_token'
const CART_SESSION_KEY_PREFIX = 'cart:session:'

// Helper to parse cookies from Cookie header (Medusa doesn't auto-parse cookies)
function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {}
  
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=')
    }
    return cookies
  }, {} as Record<string, string>)
}

interface CartSession {
  sessionId: string
  cartId: string
  userId?: string
  createdAt: number
  updatedAt: number
  fingerprint?: string
}

/**
 * Extracts cart ID from request path or body
 */
function extractCartId(req: MedusaRequest): string | null {
  // Try to extract from URL path: /store/carts/{cartId}/...
  const pathMatch = req.path?.match(/\/carts\/([^\/]+)/)
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1]
  }

  // Try to extract from request body
  if (req.body && typeof req.body === 'object') {
    const body = req.body as any
    if (body.cart_id) return body.cart_id
  }

  // Try to extract from query parameters
  if (req.query && typeof req.query === 'object') {
    const query = req.query as any
    if (query.cart_id) return query.cart_id
  }

  return null
}

/**
 * Middleware to validate cart ownership
 * Ensures that the cart being accessed belongs to the current session
 * 
 * This prevents cart hijacking attacks where an attacker could
 * modify another user's cart by guessing or intercepting the cart ID
 */
export async function validateCartOwnership(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    // Extract cart ID from request
    const requestedCartId = extractCartId(req)
    
    // If no cart ID in request, allow it to pass through
    // (might be a cart creation request)
    if (!requestedCartId) {
      console.log('[CART_OWNERSHIP] No cart ID in request, allowing through')
      return next()
    }

    // Get session token from httpOnly cookie
    const cookies = parseCookies(req.headers.cookie as string | undefined)
    const sessionToken = cookies[CART_SESSION_COOKIE]
    
    if (!sessionToken) {
      console.warn('[CART_OWNERSHIP] No session token found', {
        cartId: requestedCartId,
        path: req.path,
        method: req.method,
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip
      })
      
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'No cart session found. Please refresh the page and try again.',
        code: 'CART_SESSION_MISSING'
      })
    }

    // Retrieve session from KV store
    const session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`)
    
    if (!session) {
      console.warn('[CART_OWNERSHIP] Session not found or expired', {
        cartId: requestedCartId,
        sessionToken: sessionToken.substring(0, 8) + '...',
        path: req.path,
        method: req.method
      })
      
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'Cart session expired. Please refresh the page and try again.',
        code: 'CART_SESSION_EXPIRED'
      })
    }

    // Verify cart ownership: session's cartId must match requested cartId
    if (session.cartId !== requestedCartId) {
      console.error('[CART_OWNERSHIP] Cart ownership violation detected!', {
        sessionCartId: session.cartId,
        requestedCartId: requestedCartId,
        sessionId: session.sessionId.substring(0, 8) + '...',
        userId: session.userId,
        path: req.path,
        method: req.method,
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip,
        userAgent: req.headers['user-agent']
      })
      
      // This is a CRITICAL security violation - someone is trying to access another user's cart
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You do not have permission to access this cart.',
        code: 'CART_OWNERSHIP_VIOLATION'
      })
    }

    // Validation passed - attach validated session info to request for downstream usage
    ;(req as any).validatedCartSession = {
      sessionId: session.sessionId,
      cartId: session.cartId,
      userId: session.userId,
      isValid: true
    }

    console.log('[CART_OWNERSHIP] Cart ownership validated', {
      cartId: session.cartId,
      userId: session.userId,
      path: req.path,
      method: req.method
    })

    // Allow request to proceed
    return next()
    
  } catch (error) {
    console.error('[CART_OWNERSHIP] Validation error:', error)
    
    // On error, fail closed (deny access) rather than fail open
    return res.status(500).json({ 
      error: 'internal_error',
      message: 'Cart validation failed. Please try again.',
      code: 'CART_VALIDATION_ERROR'
    })
  }
}
