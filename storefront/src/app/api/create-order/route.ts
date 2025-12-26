import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { kvGet } from '@/lib/kv';
import { storeOrderCartMapping } from '@/lib/cashfreeMapping';

interface CustomerDetails {
  id?: string;
  email?: string;
  phone?: string;
  name?: string;
}

interface CreateOrderRequest {
  orderId: string;
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
        console.log('[CREATE_ORDER][cookie_auth_success]', {
          customerId: customerIdCookie.substring(0, 15) + '...',
        });
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
        customerId: (session as any)?.customerId,
      });

      if (session) {
        // Session exists and is valid (already validated by NextAuth)
        console.log('[CREATE_ORDER][session_auth_success]', {
          customerId: (session as any).customerId || customer?.id,
        });
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
            console.log('[CREATE_ORDER][otp_auth_success]', { phoneKey });
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
            console.log('[CREATE_ORDER][magic_link_auth_success]', { email });
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
      phoneKey: customer?.phone ? normalizePhoneDigits(customer.phone) : null,
      emailKey: customer?.email ? normalizeEmail(customer.email) : null,
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
  try {
    const body: CreateOrderRequest = await req.json();
    const { orderId, orderAmount, customer = {}, cartId } = body;

    if (!orderId || !orderAmount) {
      return NextResponse.json(
        { error: 'orderId and orderAmount required' },
        { status: 400 }
      );
    }

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
      'http://127.0.0.1:3000';
    const publicNotifyUrl = process.env.CASHFREE_NOTIFY_URL;

    const payload = {
      order_id: String(orderId),
      order_amount: Number(orderAmount),
      order_currency: 'INR',
      customer_details: {
        customer_id: safeCustomerId,
        customer_name: customer.name || 'Guest',
        customer_email: customer.email || '',
        customer_phone: digitsPhone || '',
      },
      order_meta: {
        return_url: `${appOrigin}/return?order_id=${encodeURIComponent(orderId)}${cartId ? `&cart_id=${encodeURIComponent(cartId)}` : ''
          }`,
        ...(publicNotifyUrl ? { notify_url: publicNotifyUrl } : {}),
      },
    };

    const response = await fetch(`${CF_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
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
        await storeOrderCartMapping(String(orderId), String(cartId), Number(orderAmount), 'INR', {
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
      { error: 'server error', details: String(err) },
      { status: 500 }
    );
  }
}
