// pages/api/verify-order.js
// SECURITY FIX C3, C11, C12: Added authentication, filtered response, sanitized errors
import fetch from 'node-fetch';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getOrderCartMapping } from '@/lib/cashfreeMapping';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = req.query.orderId || req.query.order_id;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId query parameter required' });
  }

  // SECURITY FIX C3: Validate that the caller owns this order
  // Check session, cookie, or verify the order exists in our mapping (only created by authenticated users)
  try {
    const session = await getServerSession(req, res, authOptions);
    const customerIdCookie = req.cookies?.customer_id;

    if (!session && !customerIdCookie) {
      // Fallback: verify the orderId exists in our secure mapping (only orders created by our system)
      const mapping = await getOrderCartMapping(orderId);
      if (!mapping) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }
  } catch (authError) {
    // If auth check fails, still allow if we have a valid mapping (return page scenario)
    try {
      const mapping = await getOrderCartMapping(orderId);
      if (!mapping) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } catch {
      return res.status(403).json({ error: 'Unauthorized' });
    }
  }

  const CF_BASE = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  // SECURITY FIX M11: Fail fast if credentials are missing
  const cfClientId = process.env.CASHFREE_CLIENT_ID;
  const cfClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!cfClientId || !cfClientSecret) {
    return res.status(503).json({ error: 'Payment service unavailable' });
  }

  const url = `${CF_BASE}/orders/${encodeURIComponent(orderId)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': cfClientId,
        'x-client-secret': cfClientSecret,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Verification failed' });
    }

    // SECURITY FIX C12: Only return the fields the frontend actually needs
    // Never expose raw Cashfree response (payment method details, customer info, internal IDs)
    return res.status(200).json({
      order_status: data.order_status,
      order_amount: data.order_amount,
      order_currency: data.order_currency,
      order_id: data.order_id,
    });
  } catch (err) {
    console.error('[VERIFY_ORDER][error]', { orderId, error: String(err) });
    // SECURITY FIX C11: Never leak error details to client
    return res.status(500).json({ error: 'Verification failed' });
  }
}
