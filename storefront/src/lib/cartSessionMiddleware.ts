import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kvGet } from './kv';

// Constants matching the session API
const CART_SESSION_COOKIE = 'cart_session_token';
const CART_SESSION_KEY_PREFIX = 'cart:session:';

interface CartSession {
  sessionId: string;
  cartId: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  fingerprint?: string;
}

export interface ValidatedCartSession {
  cartId: string;
  userId?: string;
  sessionId: string;
  isValid: boolean;
}

/**
 * Validates that the current request has a valid cart session
 * and that the requested cart ID matches the session's cart ID
 */
export async function validateCartSession(
  req: NextRequest,
  requestedCartId?: string
): Promise<ValidatedCartSession> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CART_SESSION_COOKIE)?.value;
    
    if (!sessionToken) {
      console.warn('[CART_SESSION_MIDDLEWARE] No session token found');
      return {
        cartId: '',
        sessionId: '',
        isValid: false
      };
    }

    // Retrieve session from KV store
    const session = await kvGet<CartSession>(`${CART_SESSION_KEY_PREFIX}${sessionToken}`);
    
    if (!session) {
      console.warn('[CART_SESSION_MIDDLEWARE] Session not found in KV store', {
        sessionToken: sessionToken.substring(0, 8) + '...'
      });
      return {
        cartId: '',
        sessionId: sessionToken,
        isValid: false
      };
    }

    // If a specific cart ID is requested, verify it matches the session
    if (requestedCartId && requestedCartId !== session.cartId) {
      console.error('[CART_SESSION_MIDDLEWARE] Cart ID mismatch', {
        sessionCartId: session.cartId,
        requestedCartId,
        sessionId: session.sessionId.substring(0, 8) + '...'
      });
      return {
        cartId: session.cartId,
        userId: session.userId,
        sessionId: session.sessionId,
        isValid: false
      };
    }

    // Session is valid
    return {
      cartId: session.cartId,
      userId: session.userId,
      sessionId: session.sessionId,
      isValid: true
    };
    
  } catch (error) {
    console.error('[CART_SESSION_MIDDLEWARE] Error validating session:', error);
    return {
      cartId: '',
      sessionId: '',
      isValid: false
    };
  }
}

/**
 * Middleware to protect cart-related API routes
 * Ensures the request has a valid cart session before proceeding
 */
export async function requireCartSession(
  req: NextRequest,
  handler: (req: NextRequest, session: ValidatedCartSession) => Promise<NextResponse>
): Promise<NextResponse> {
  // Extract cart ID from request (could be in URL params, query, or body)
  let requestedCartId: string | undefined;
  
  // Try to get from URL path (e.g., /api/cart/[cartId]/...)
  const pathMatch = req.url.match(/\/cart\/([^\/]+)/);
  if (pathMatch) {
    requestedCartId = pathMatch[1];
  }
  
  // Try to get from query params
  if (!requestedCartId) {
    const url = new URL(req.url);
    requestedCartId = url.searchParams.get('cartId') || undefined;
  }

  // Validate session
  const session = await validateCartSession(req, requestedCartId);
  
  if (!session.isValid) {
    console.warn('[CART_SESSION_MIDDLEWARE] Unauthorized cart access attempt', {
      requestedCartId,
      url: req.url,
      method: req.method,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
    });
    
    return NextResponse.json(
      {
        error: 'unauthorized',
        message: 'Invalid or expired cart session',
        code: 'CART_SESSION_INVALID'
      },
      { status: 401 }
    );
  }

  // Session is valid, proceed with the handler
  return handler(req, session);
}

/**
 * Helper to create a new cart session from API routes
 */
export async function createCartSession(
  cartId: string,
  userId?: string
): Promise<{ sessionToken: string; success: boolean }> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/cart/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cartId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create cart session: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract session token from Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    const sessionToken = setCookieHeader?.match(/cart_session_token=([^;]+)/)?.[1] || '';

    return {
      sessionToken,
      success: true
    };
  } catch (error) {
    console.error('[CART_SESSION_MIDDLEWARE] Failed to create session:', error);
    return {
      sessionToken: '',
      success: false
    };
  }
}
