import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { kvGet } from '@/lib/kv';
import { storeOrderCartMapping } from '@/lib/cashfreeMapping';
import { randomUUID } from 'crypto';

interface CustomerDetails {
  id?: string;
  email?: string;
  phone?: string;
  name?: string;
}

interface CreateOrderRequest {
  orderId?: string; // Ignored — server generates order ID (H2 fix)
  orderAmount: number;
  customer?: CustomerDetails;
  cartId?: string;
}

interface AuthResult {
  authenticated: boolean;
  customerId?: string;
  method?: string;
  reason?: string;
}

/**
 * Validate checkout authentication for Cashfree payment creation
 * This prevents unauthorized users from creating payment sessions
 */
async function validateCheckoutAuth(
  req: NextRequest,
  customer?: CustomerDetails,
  cartId?: string
): Promise<AuthResult> {
  try {
    // Helper functions
    const normalizeEmail = (email?: string) =>
      email ? String(email).trim().toLowerCase() : undefined;
    const normalizePhoneDigits = (phone?: string) => {
      if (!phone) return undefined;
      const digits = String(phone).replace(/\D/g, '');
      return digits ? `+${digits}` : undefined;
    };

    // PRIORITY 0: Check httpOnly cookie (Most reliable - set after OTP/Magic Link verification)
    try {
      const customerIdCookie = req.cookies.get('customer_id')?.value;

      if (customerIdCookie) {
        console.log('[CREATE_ORDER][cookie_auth_success]');
        return {
          authenticated: true,
          customerId: customerIdCookie,
          method: 'cookie',
        };
      }
    } catch (error) {
      console.error('[CREATE_ORDER][cookie_check_error]', error);
    }

    // PRIORITY 1: Check for valid NextAuth session (App Router way)
    try {
      const session = await getServerSession(authOptions);

      console.log('[CREATE_ORDER][session_check]', {
        hasSession: !!session,
        hasCustomerId: !!(session as any)?.customerId,
      });

      if (session) {
        // Session exists and is valid (already validated by NextAuth)
        console.log('[CREATE_ORDER][session_auth_success]');
        return {
          authenticated: true,
          customerId: (session as any).customerId || customer?.id,
          method: 'session',
        };
      }
    } catch (error) {
      console.error('[CREATE_ORDER][session_check_error]', error);
    }

    // PRIORITY 2: Check OTP verification marker (WhatsApp/Phone)
    if (customer?.phone) {
      const phoneKey = normalizePhoneDigits(customer.phone);

      if (phoneKey) {
        try {
          const otpMarker = await kvGet(`otp:ok:${phoneKey}`);

          if (otpMarker) {
            console.log('[CREATE_ORDER][otp_auth_success]');
            return {
              authenticated: true,
              customerId: customer?.id,
              method: 'otp',
            };
          }
        } catch (error) {
          console.error('[CREATE_ORDER][otp_check_error]', error);
        }
      }
    }

    // PRIORITY 3: Check Magic Link verification marker (Email)
    if (customer?.email) {
      const email = normalizeEmail(customer.email);

      if (email) {
        try {
          const state = cartId ? `checkout-${cartId}` : '';
          const keyGeneral = `magic:ok:${email}`;
          const keyState = state ? `magic:ok:${email}:${state}` : '';

          const [generalMarker, stateMarker] = await Promise.all([
            kvGet(keyGeneral),
            keyState ? kvGet(keyState) : Promise.resolve(null),
          ]);

          if (generalMarker || stateMarker) {
            console.log('[CREATE_ORDER][magic_link_auth_success]');
            return {
              authenticated: true,
              customerId: customer?.id,
              method: 'magic_link',
            };
          }
        } catch (error) {
          console.error('[CREATE_ORDER][magic_link_check_error]', error);
        }
      }
    }

    // DEBUG: Log what we checked
    console.log('[CREATE_ORDER][auth_check_debug]', {
      hasPhone: !!customer?.phone,
      hasEmail: !!customer?.email,
    });

    // No valid authentication found
    return {
      authenticated: false,
      reason:
        'No valid authentication found. User must complete identity verification (OTP, Magic Link, or Login) before checkout.',
    };
  } catch (error) {
    console.error('[CREATE_ORDER][auth_validation_error]', error);
    return {
      authenticated: false,
      reason: 'Authentication validation failed: ' + String((error as any)?.message || error),
    };
  }
}

export async function POST(req: NextRequest) {
  // H1: CSRF protection — validate Origin for browser requests
  const internalSecret = req.headers.get('x-internal-call')
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
    // Server-to-server call (e.g., webhook) — skip CSRF check
  } else {
    const origin = req.headers.get('origin')
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'
    if (origin && origin !== expectedOrigin) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
    }
  }

  try {
    const body: CreateOrderRequest = await req.json();
    const { orderAmount: clientAmount, customer = {}, cartId } = body;

    if (!cartId) {
      return NextResponse.json(
        { error: 'cartId required' },
        { status: 400 }
      );
    }

    // SECURITY FIX H2: Generate order ID server-side with crypto.randomUUID()
    // Never trust client-generated order IDs (predictable, spoofable, collision-prone)
    const orderId = `order_${randomUUID().replace(/-/g, '')}`;

    // CRITICAL SECURITY: Validate checkout authentication before creating payment
    const authResult = await validateCheckoutAuth(req, customer, cartId);

    if (!authResult.authenticated) {
      console.error('[CREATE_ORDER][auth_failed]', {
        orderId,
        cartId,
        reason: authResult.reason,
      });

      return NextResponse.json(
        {
          error: 'authentication_required',
          message:
            'You must complete identity verification before initiating payment. Please verify using OTP, Magic Link, or Login.',
          reason: authResult.reason,
        },
        { status: 403 }
      );
    }

    console.log('[CREATE_ORDER][auth_success]', {
      orderId,
      cartId,
      method: authResult.method,
    });

    // SECURITY FIX C1: Fetch cart total from Medusa (server-authoritative amount)
    // Never trust client-supplied orderAmount — derive it from the cart on the server
    const medusaBaseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000';
    const medusaPublishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;

    let serverAmount: number;
    try {
      const cartResponse = await fetch(
        `${medusaBaseUrl}/store/carts/${cartId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-publishable-api-key': medusaPublishableKey || '',
          },
        }
      );

      if (!cartResponse.ok) {
        console.error('[CREATE_ORDER][cart_fetch_failed]', { cartId, status: cartResponse.status });
        return NextResponse.json(
          { error: 'cart_fetch_failed', message: 'Could not verify cart total. Please try again.' },
          { status: 502 }
        );
      }

      const cartData = await cartResponse.json();
      const cartTotal = cartData?.cart?.total; // Medusa v2 stores INR in rupees (not paise)

      if (typeof cartTotal !== 'number' || cartTotal <= 0) {
        console.error('[CREATE_ORDER][invalid_cart_total]', { cartId, cartTotal });
        return NextResponse.json(
          { error: 'invalid_cart', message: 'Cart total is invalid or zero.' },
          { status: 400 }
        );
      }

      // Medusa v2 already stores amounts in base currency (rupees for INR)
      // Cashfree also expects rupees — no conversion needed
      serverAmount = Number(cartTotal.toFixed(2));

      // Sanity check: log if client amount differs significantly (potential manipulation attempt)
      if (typeof clientAmount === 'number' && Math.abs(clientAmount - serverAmount) > 0.01) {
        console.warn('[CREATE_ORDER][amount_mismatch_detected]', {
          orderId,
          cartId,
          clientAmount,
          serverAmount,
          diff: Math.abs(clientAmount - serverAmount),
        });
      }
    } catch (fetchError) {
      console.error('[CREATE_ORDER][cart_fetch_error]', { cartId, error: String(fetchError) });
      // FAIL CLOSED: Do not proceed if we cannot verify the amount
      return NextResponse.json(
        { error: 'cart_verification_failed', message: 'Could not verify cart total. Please try again.' },
        { status: 502 }
      );
    }

    const CF_BASE =
      process.env.CASHFREE_ENV === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    // Build a Cashfree-safe customer_id: alphanumeric, underscore, hyphen only
    const digitsPhone = (customer.phone || '').toString().replace(/\D/g, '');
    const derivedFromEmail = (customer.email || '').toString().split('@')[0];
    const candidateId = (
      customer.id ||
      derivedFromEmail ||
      (digitsPhone ? `cust_${digitsPhone}` : '') ||
      ''
    ).toString();
    const safeCustomerId = (candidateId || `guest_${Date.now()}`).replace(
      /[^A-Za-z0-9_-]/g,
      '_'
    );

    const appOrigin =
      process.env.CASHFREE_RETURN_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      'http://localhost:3000';
    const publicNotifyUrl = process.env.CASHFREE_NOTIFY_URL;

    const payload = {
      order_id: String(orderId),
      order_amount: serverAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: safeCustomerId,
        customer_name: customer.name || 'Guest',
        customer_email: customer.email || 'noreply@shilamurthi.com',
        customer_phone: digitsPhone || '9999999999',
      },
      order_meta: {
        // SECURITY FIX C7: Do NOT include cart_id in return URL
        // Cart ID is resolved server-side from HMAC-signed mapping
        return_url: `${appOrigin}/return?order_id=${encodeURIComponent(orderId)}`,
        ...(publicNotifyUrl ? { notify_url: publicNotifyUrl } : {}),
      },
    };

    // SECURITY FIX M11: Fail fast if Cashfree credentials are missing
    const cfClientId = process.env.CASHFREE_CLIENT_ID
    const cfClientSecret = process.env.CASHFREE_CLIENT_SECRET
    if (!cfClientId || !cfClientSecret) {
      console.error('[CREATE_ORDER][missing_credentials] CASHFREE_CLIENT_ID or CASHFREE_CLIENT_SECRET not configured')
      return NextResponse.json(
        { error: 'payment_service_unavailable', message: 'Payment service is not configured. Please contact support.' },
        { status: 503 }
      )
    }

    const response = await fetch(`${CF_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': cfClientId,
        'x-client-secret': cfClientSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: 'create-order failed', details: data },
        { status: response.status }
      );
    }

    // SECURITY FIX: Store secure order-cart mapping with cryptographic binding
    if (orderId && cartId) {
      try {
        await storeOrderCartMapping(String(orderId), String(cartId), serverAmount, 'INR', {
          id: customer?.id,
          email: customer?.email,
          phone: customer?.phone,
        });
      } catch (mappingError) {
        console.error('[CREATE_ORDER][mapping_error]', mappingError);
        // Continue even if mapping fails - order was created successfully
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[CREATE_ORDER][error]', err);
    return NextResponse.json(
      { error: 'server error', message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
