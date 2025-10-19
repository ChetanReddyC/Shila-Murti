import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kvGet, kvSet, kvDel } from '../../../../lib/kv';
import crypto from 'crypto';

// Constants
const CART_SESSION_COOKIE = 'cart_session_token';
const CART_SESSION_TTL = 86400 * 7; // 7 days in seconds
const CART_SESSION_KEY_PREFIX = 'cart:session:';

// Types
interface CartSession {
  sessionId: string;
  cartId: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  fingerprint?: string;
}

// Generate secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Generate browser fingerprint for additional security
function generateFingerprint(req: NextRequest): string {
  const userAgent = req.headers.get('user-agent') || '';
  const acceptLanguage = req.headers.get('accept-language') || '';
  const acceptEncoding = req.headers.get('accept-encoding') || '';
  const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
}

// Verify session belongs to current browser
function verifyFingerprint(session: CartSession, req: NextRequest): boolean {
  const currentFingerprint = generateFingerprint(req);
  // Allow some flexibility for fingerprint changes (browser updates, etc)
  // But log suspicious activity
  if (session.fingerprint && session.fingerprint !== currentFingerprint) {
    console.warn('[CART_SESSION] Fingerprint mismatch detected', {
      sessionId: session.sessionId,
      stored: session.fingerprint,
      current: currentFingerprint
    });
    // For now, we'll allow it but could make this stricter
    return true;
  }
  return true;
}

// GET - Retrieve current cart session
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CART_SESSION_COOKIE)?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ 
        session: null,
        message: 'No active cart session' 
      });
    }

    // Retrieve session from KV store
    const session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`);
    
    if (!session) {
      // Session expired or invalid - clear cookie
      const response = NextResponse.json({ 
        session: null,
        message: 'Session expired or invalid' 
      });
      
      response.cookies.set(CART_SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
        path: '/'
      });
      
      return response;
    }

    // Verify fingerprint for security
    if (!verifyFingerprint(session, req)) {
      console.error('[CART_SESSION] Session fingerprint verification failed', {
        sessionId: session.sessionId
      });
      return NextResponse.json({ 
        session: null,
        message: 'Session verification failed' 
      }, { status: 403 });
    }

    // Update last accessed time
    const updatedSession = {
      ...session,
      updatedAt: Date.now()
    };
    
    // Extend session TTL on access
    await kvSet(
      `${CART_SESSION_KEY_PREFIX}${sessionToken}`,
      updatedSession,
      CART_SESSION_TTL
    );

    return NextResponse.json({ 
      session: {
        cartId: session.cartId,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: updatedSession.updatedAt
      },
      message: 'Session retrieved successfully' 
    });
    
  } catch (error) {
    console.error('[CART_SESSION] GET error:', error);
    return NextResponse.json({ 
      error: 'Failed to retrieve session',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create or update cart session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cartId, userId } = body;
    
    if (!cartId) {
      return NextResponse.json({ 
        error: 'Cart ID is required' 
      }, { status: 400 });
    }

    const cookieStore = await cookies();
    let sessionToken = cookieStore.get(CART_SESSION_COOKIE)?.value;
    
    // Check if we need to create a new session or update existing
    let session: CartSession | null = null;
    
    if (sessionToken) {
      session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`);
    }

    const fingerprint = generateFingerprint(req);
    const now = Date.now();

    if (session) {
      // Update existing session
      session = {
        ...session,
        cartId,
        userId: userId || session.userId,
        updatedAt: now,
        fingerprint
      };
      
      console.log('[CART_SESSION] Updating existing session', {
        sessionId: session.sessionId,
        cartId,
        userId
      });
      
    } else {
      // Create new session
      sessionToken = generateSessionToken();
      session = {
        sessionId: sessionToken,
        cartId,
        userId,
        createdAt: now,
        updatedAt: now,
        fingerprint
      };
      
      console.log('[CART_SESSION] Creating new session', {
        sessionId: session.sessionId,
        cartId,
        userId
      });
    }

    // Store session in KV store
    await kvSet(
      `${CART_SESSION_KEY_PREFIX}${sessionToken}`,
      session,
      CART_SESSION_TTL
    );

    // Create response with httpOnly cookie
    const response = NextResponse.json({ 
      success: true,
      sessionId: session.sessionId,
      cartId: session.cartId,
      message: 'Session created/updated successfully'
    });

    // Set secure httpOnly cookie
    response.cookies.set(CART_SESSION_COOKIE, sessionToken!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: CART_SESSION_TTL,
      path: '/'
    });

    return response;
    
  } catch (error) {
    console.error('[CART_SESSION] POST error:', error);
    return NextResponse.json({ 
      error: 'Failed to create/update session',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE - Clear cart session
export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CART_SESSION_COOKIE)?.value;
    
    if (sessionToken) {
      // Delete from KV store
      await kvDel(`${CART_SESSION_KEY_PREFIX}${sessionToken}`);
      
      console.log('[CART_SESSION] Session deleted', {
        sessionToken: sessionToken.substring(0, 8) + '...'
      });
    }

    // Clear cookie
    const response = NextResponse.json({ 
      success: true,
      message: 'Session cleared successfully' 
    });
    
    response.cookies.set(CART_SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/'
    });

    return response;
    
  } catch (error) {
    console.error('[CART_SESSION] DELETE error:', error);
    return NextResponse.json({ 
      error: 'Failed to clear session',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PATCH - Validate session and extend TTL
export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CART_SESSION_COOKIE)?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ 
        valid: false,
        message: 'No session token provided' 
      }, { status: 401 });
    }

    const session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`);
    
    if (!session) {
      return NextResponse.json({ 
        valid: false,
        message: 'Session expired or invalid' 
      }, { status: 401 });
    }

    // Verify fingerprint
    if (!verifyFingerprint(session, req)) {
      return NextResponse.json({ 
        valid: false,
        message: 'Session verification failed' 
      }, { status: 403 });
    }

    // Validate cart ID if provided in body
    const body = await req.json().catch(() => ({}));
    if (body.cartId && body.cartId !== session.cartId) {
      console.warn('[CART_SESSION] Cart ID mismatch in validation', {
        sessionCartId: session.cartId,
        requestCartId: body.cartId
      });
      return NextResponse.json({ 
        valid: false,
        message: 'Cart ID mismatch' 
      }, { status: 403 });
    }

    // Update session with new timestamp and extend TTL
    const updatedSession = {
      ...session,
      updatedAt: Date.now()
    };
    
    await kvSet(
      `${CART_SESSION_KEY_PREFIX}${sessionToken}`,
      updatedSession,
      CART_SESSION_TTL
    );

    return NextResponse.json({ 
      valid: true,
      cartId: session.cartId,
      userId: session.userId,
      message: 'Session is valid' 
    });
    
  } catch (error) {
    console.error('[CART_SESSION] PATCH error:', error);
    return NextResponse.json({ 
      valid: false,
      error: 'Failed to validate session',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
