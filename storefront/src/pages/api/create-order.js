// pages/api/create-order.js
import fetch from 'node-fetch';
import { storeOrderCartMapping } from '../../lib/cashfreeMapping.ts';

/**
 * Validate checkout authentication for Cashfree payment creation (Pages Router)
 * This prevents unauthorized users from creating payment sessions
 * Simplified version that checks KV markers and session tokens without importing authOptions
 */
async function validateCheckoutAuthJS(req, res, customer, cartId) {
  try {
    const { getToken } = await import('next-auth/jwt');
    const { kvGet } = await import('../../lib/kv');
    
    // Helper functions
    const normalizeEmail = (email) => email ? String(email).trim().toLowerCase() : undefined;
    const normalizePhoneDigits = (phone) => {
      if (!phone) return undefined;
      const digits = String(phone).replace(/\D/g, '');
      return digits ? `+${digits}` : undefined;
    };
    
    // PRIORITY 1: Check for valid NextAuth JWT token
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      
      if (token && !token.jti) {
        // Old token format without jti - consider it valid
        return {
          authenticated: true,
          customerId: token.customerId || customer?.id,
          method: 'session'
        };
      }
      
      if (token && token.jti) {
        // Check if JWT is blacklisted
        const { isJWTBlacklisted } = await import('../../lib/auth/jwtBlacklist');
        const isBlacklisted = await isJWTBlacklisted(token.jti);
        
        if (!isBlacklisted) {
          // Valid token that's not blacklisted
          return {
            authenticated: true,
            customerId: token.customerId || customer?.id,
            method: 'session'
          };
        }
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
              method: 'otp'
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
              method: 'magic_link'
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
      emailKey: customer?.email ? normalizeEmail(customer.email) : null
    });
    
    // No valid authentication found
    return {
      authenticated: false,
      reason: 'No valid authentication found. User must complete identity verification (OTP, Magic Link, or Login) before checkout.'
    };
  } catch (error) {
    console.error('[CREATE_ORDER][auth_validation_error]', error);
    return {
      authenticated: false,
      reason: 'Authentication validation failed: ' + String(error.message || error)
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, orderAmount, customer = {}, cartId } = req.body || {};
  if (!orderId || !orderAmount) {
    return res.status(400).json({ error: 'orderId and orderAmount required' });
  }

  // CRITICAL SECURITY: Validate checkout authentication before creating payment
  // Pass both req and res for Pages Router compatibility
  const authResult = await validateCheckoutAuthJS(req, res, customer, cartId);
  
  if (!authResult.authenticated) {
    console.error('[CREATE_ORDER][auth_failed]', {
      orderId,
      cartId,
      reason: authResult.reason
    });
    
    return res.status(403).json({
      error: 'authentication_required',
      message: 'You must complete identity verification before initiating payment. Please verify using OTP, Magic Link, or Login.',
      reason: authResult.reason
    });
  }
  
  console.log('[CREATE_ORDER][auth_success]', {
    orderId,
    cartId,
    method: authResult.method
  });

  const CF_BASE = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  // Build a Cashfree-safe customer_id: alphanumeric, underscore, hyphen only
  const digitsPhone = (customer.phone || '').toString().replace(/\D/g, '');
  const derivedFromEmail = (customer.email || '').toString().split('@')[0];
  const candidateId = (customer.id || derivedFromEmail || (digitsPhone ? `cust_${digitsPhone}` : '') || '').toString();
  const safeCustomerId = (candidateId || `guest_${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, '_');

  const appOrigin = process.env.CASHFREE_RETURN_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://127.0.0.1:3000'
  const publicNotifyUrl = process.env.CASHFREE_NOTIFY_URL // optional FULL URL for webhook in dev via tunnel

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
      return_url: `${appOrigin}/return?order_id=${encodeURIComponent(orderId)}${cartId ? `&cart_id=${encodeURIComponent(cartId)}` : ''}`,
      ...(publicNotifyUrl ? { notify_url: publicNotifyUrl } : {}),
    },
  };

  try {
    const response = await fetch(`${CF_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION,
        'x-client-id': process.env.CASHFREE_CLIENT_ID,
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'create-order failed', details: data });
    }
    
    // SECURITY FIX: Store secure order-cart mapping with cryptographic binding
    // Include customer authentication info for validation on return
    if (orderId && cartId) {
      try {
        await storeOrderCartMapping(
          String(orderId),
          String(cartId),
          Number(orderAmount),
          'INR',
          {
            id: customer?.id,
            email: customer?.email,
            phone: customer?.phone
          }
        );
      } catch (mappingError) {
        console.error('[CREATE_ORDER][mapping_error]');
        // Continue even if mapping fails - order was created successfully
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'server error', details: String(err) });
  }
}


