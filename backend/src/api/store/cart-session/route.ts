import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { kvGet, kvSet } from "../../../utils/kv"
import crypto from "crypto"

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
const CART_SESSION_KEY_PREFIX = 'cart:session:'

interface CartSession {
  sessionId: string
  cartId: string
  userId?: string
  createdAt: number
  updatedAt: number
  fingerprint?: string
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function generateFingerprint(req: MedusaRequest): string {
  const userAgent = req.headers['user-agent'] || ''
  const acceptLanguage = req.headers['accept-language'] || ''
  const acceptEncoding = req.headers['accept-encoding'] || ''
  const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`
  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16)
}

// GET - Retrieve current cart session
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

    const session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`)
    
    if (!session) {
      res.setHeader('Set-Cookie', `${CART_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`)
      return res.json({ 
        session: null,
        message: 'Session expired or invalid' 
      })
    }

    // Update last accessed time
    const updatedSession = {
      ...session,
      updatedAt: Date.now()
    }
    
    await kvSet(
      `${CART_SESSION_KEY_PREFIX}${sessionToken}`,
      updatedSession,
      CART_SESSION_TTL
    )

    return res.json({ 
      session: {
        cartId: session.cartId,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: updatedSession.updatedAt
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
      body: req.body,
      cookieHeader: req.headers.cookie,
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
    let sessionToken = cookies[CART_SESSION_COOKIE]
    let session: CartSession | null = null
    
    if (sessionToken) {
      session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`)
    }

    const fingerprint = generateFingerprint(req)
    const now = Date.now()

    if (session) {
      // Update existing session
      session = {
        ...session,
        cartId,
        userId: userId || session.userId,
        updatedAt: now,
        fingerprint
      }
      
      console.log('[CART_SESSION] Updating existing session', {
        sessionId: session.sessionId.substring(0, 8) + '...',
        cartId,
        userId
      })
      
    } else {
      // Create new session
      sessionToken = generateSessionToken()
      session = {
        sessionId: sessionToken,
        cartId,
        userId,
        createdAt: now,
        updatedAt: now,
        fingerprint
      }
      
      console.log('[CART_SESSION] Creating new session', {
        sessionId: session.sessionId.substring(0, 8) + '...',
        cartId,
        userId
      })
    }

    // Store session in KV store
    await kvSet(
      `${CART_SESSION_KEY_PREFIX}${sessionToken}`,
      session,
      CART_SESSION_TTL
    )

    // Set httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production'
    const cookieValue = [
      `${CART_SESSION_COOKIE}=${sessionToken}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      'SameSite=Lax', // Changed from Strict to Lax for cross-origin requests
      `Max-Age=${CART_SESSION_TTL}`,
      'Path=/'
    ].filter(Boolean).join('; ')

    res.setHeader('Set-Cookie', cookieValue)

    return res.json({ 
      success: true,
      sessionId: session.sessionId,
      cartId: session.cartId,
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
      await kvSet(`${CART_SESSION_KEY_PREFIX}${sessionToken}`, null, 1)
      
      console.log('[CART_SESSION] Session deleted', {
        sessionToken: sessionToken.substring(0, 8) + '...'
      })
    }

    res.setHeader('Set-Cookie', `${CART_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`)

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
