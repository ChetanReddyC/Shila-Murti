// pages/api/create-order.js
import fetch from 'node-fetch';

// In-memory map to reconcile Cashfree order_id to Medusa cartId (dev-only)
const orderCartMap = global.orderCartMap || new Map();
global.orderCartMap = orderCartMap;

export default async function handler(req, res) {
  console.log('[create-order] handler start - method:', req.method, 'body:', req.body)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, orderAmount, customer = {}, cartId } = req.body || {};
  console.log('[create-order] parsed body:', { orderId, orderAmount, customer, cartId });
  if (!orderId || !orderAmount) {
    return res.status(400).json({ error: 'orderId and orderAmount required' });
  }

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
  console.log('[create-order] Cashfree create-order payload:', payload, 'CF_BASE:', CF_BASE);

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
    console.log('[create-order] response status:', response.status, 'data:', data);
    if (!response.ok) {
      console.error('Cashfree create-order error:', data);
      return res.status(response.status).json({ error: 'create-order failed', details: data });
    }
    try {
      if (orderId && cartId) {
        orderCartMap.set(String(orderId), String(cartId));
        // Auto-expire mapping after 1 hour
        setTimeout(() => orderCartMap.delete(String(orderId)), 60 * 60 * 1000).unref?.();
        // Also persist mapping in KV via app route for resilience across instances
        try {
          const appOrigin = process.env.CASHFREE_RETURN_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://127.0.0.1:3000'
          fetch(`${appOrigin}/api/cashfree/map`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: String(orderId), cartId: String(cartId) })
          }).catch(() => {})
        } catch {}
      }
    } catch {}

    return res.status(200).json(data);
  } catch (err) {
    console.error('create-order exception:', err);
    return res.status(500).json({ error: 'server error', details: String(err) });
  }
}


