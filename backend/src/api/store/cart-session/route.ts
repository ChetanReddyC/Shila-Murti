/**
 * Enhanced Cart Session API
 * 
 * Security Audit Issue #9 Fix: Session Management Weaknesses
 * 
 * Features:
 * - Cryptographically secure session tokens
 * - Idle timeout (1 hour) and session expiration (7 days)
 * - Automatic session rotation for long-lived sessions
 * - Device fingerprinting and validation
 * - IP address tracking
 * - HttpOnly + Secure + SameSite cookies
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SessionManager } from "../../../services/SessionManager"

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

const CART_SESSION_COOKIE = 'cart_session_token'
const CART_SESSION_TTL = 86400 * 7 // 7 days in seconds

// GET - Retrieve current cart session (with validation)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cookies = parseCookies(req.headers.cookie as string | undefined)
    const sessionToken = cookies[CART_SESSION_COOKIE]
    
    if (!sessionToken) {
      return res.json({ 
        session: null,
        message: 'No active cart session' 
      })
    }

    // Validate session (checks expiration, idle timeout, fingerprint)
    const validation = await SessionManager.validateSession(req, sessionToken)
    
    if (!validation.valid) {
      // Clear invalid cookie
      const isProductionEnv = process.env.NODE_ENV === 'production'
      const cookieValue = [
        `${CART_SESSION_COOKIE}=`,
        'HttpOnly',
        isProductionEnv ? 'Secure' : '',
        isProductionEnv ? 'SameSite=None' : 'SameSite=Lax',
        'Max-Age=0',
        'Path=/'
      ].filter(Boolean).join('; ')

      res.setHeader('Set-Cookie', cookieValue)

      return res.json({
        session: null,
        message: `Session ${validation.reason}`,
        reason: validation.reason
      })
    }

    // Check if session needs rotation
    if (validation.requiresRotation) {
      return res.json({ 
        session: {
          cartId: validation.session!.cartId,
          userId: validation.session!.userId,
          createdAt: validation.session!.createdAt,
          lastAccessedAt: validation.session!.lastAccessedAt
        },
        requiresRotation: true,
        message: 'Session valid but rotation recommended'
      })
    }

    return res.json({ 
      session: {
        cartId: validation.session!.cartId,
        userId: validation.session!.userId,
        createdAt: validation.session!.createdAt,
        lastAccessedAt: validation.session!.lastAccessedAt
      },
      message: 'Session retrieved successfully' 
    })
    
  } catch (error) {
    console.error('[CART_SESSION] GET error:', error)
    return res.status(500).json({ 
      error: 'Failed to retrieve session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// POST - Create or update cart session
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    console.log('[CART_SESSION] POST request received', {
      hasBody: !!req.body,
      hasPublishableKey: !!req.headers['x-publishable-api-key']
    })
    
    const { cartId, userId } = req.body as { cartId?: string; userId?: string }
    
    if (!cartId) {
      console.error('[CART_SESSION] No cartId in request body')
      return res.status(400).json({ 
        error: 'Cart ID is required' 
      })
    }

    const cookies = parseCookies(req.headers.cookie as string | undefined)
    const existingToken = cookies[CART_SESSION_COOKIE]
    
    let sessionToken: string
    let sessionData
    
    // Check if updating existing session
    if (existingToken) {
      const validation = await SessionManager.validateSession(req, existingToken)
      
      if (validation.valid && validation.session) {
        // Update existing session
        await SessionManager.updateSession(existingToken, { cartId, userId })
        sessionToken = existingToken
        sessionData = validation.session
        
        console.log('[CART_SESSION] Updated existing session', {
          sessionId: existingToken.substring(0, 12) + '...',
          cartId,
          userId: userId ? userId.substring(0, 8) + '...' : 'guest'
        })
      } else {
        // Session invalid, create new one
        const result = await SessionManager.createSession(req, cartId, userId)
        sessionToken = result.token
        sessionData = result.session
      }
    } else {
      // Create new session
      const result = await SessionManager.createSession(req, cartId, userId)
      sessionToken = result.token
      sessionData = result.session
    }

    // Set httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production'
    const cookieValue = [
      `${CART_SESSION_COOKIE}=${sessionToken}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      isProduction ? 'SameSite=None' : 'SameSite=Lax',
      `Max-Age=${CART_SESSION_TTL}`,
      'Path=/'
    ].filter(Boolean).join('; ')

    res.setHeader('Set-Cookie', cookieValue)

    return res.json({ 
      success: true,
      sessionId: sessionData.sessionId,
      cartId: sessionData.cartId,
      message: 'Session created/updated successfully'
    })
    
  } catch (error) {
    console.error('[CART_SESSION] POST error:', error)
    return res.status(500).json({ 
      error: 'Failed to create/update session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// DELETE - Clear cart session
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cookies = parseCookies(req.headers.cookie as string | undefined)
    const sessionToken = cookies[CART_SESSION_COOKIE]
    
    if (sessionToken) {
      await SessionManager.deleteSession(sessionToken)
      
      console.log('[CART_SESSION] Session deleted', {
        sessionToken: sessionToken.substring(0, 12) + '...'
      })
    }

    // Clear cookie
    const isProductionEnv = process.env.NODE_ENV === 'production'
    const cookieValue = [
      `${CART_SESSION_COOKIE}=`,
      'HttpOnly',
      isProductionEnv ? 'Secure' : '',
      isProductionEnv ? 'SameSite=None' : 'SameSite=Lax',
      'Max-Age=0',
      'Path=/'
    ].filter(Boolean).join('; ')
    
    res.setHeader('Set-Cookie', cookieValue)

    return res.json({ 
      success: true,
      message: 'Session cleared successfully' 
    })
    
  } catch (error) {
    console.error('[CART_SESSION] DELETE error:', error)
    return res.status(500).json({ 
      error: 'Failed to clear session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// PUT - Rotate session (for long-lived sessions)
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cookies = parseCookies(req.headers.cookie as string | undefined)
    const oldSessionToken = cookies[CART_SESSION_COOKIE]
    
    if (!oldSessionToken) {
      return res.status(400).json({ 
        error: 'No active session to rotate' 
      })
    }

    const result = await SessionManager.rotateSession(req, oldSessionToken)
    
    if (!result) {
      return res.status(400).json({ 
        error: 'Failed to rotate session - session invalid' 
      })
    }

    // Set new session cookie
    const isProduction = process.env.NODE_ENV === 'production'
    const cookieValue = [
      `${CART_SESSION_COOKIE}=${result.token}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      isProduction ? 'SameSite=None' : 'SameSite=Lax',
      `Max-Age=${CART_SESSION_TTL}`,
      'Path=/'
    ].filter(Boolean).join('; ')

    res.setHeader('Set-Cookie', cookieValue)

    return res.json({ 
      success: true,
      sessionId: result.session.sessionId,
      cartId: result.session.cartId,
      rotationCount: result.session.rotationCount,
      message: 'Session rotated successfully' 
    })
    
  } catch (error) {
    console.error('[CART_SESSION] PUT (rotate) error:', error)
    return res.status(500).json({ 
      error: 'Failed to rotate session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
