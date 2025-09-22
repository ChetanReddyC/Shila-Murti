// pages/api/verify-order.js
import fetch from 'node-fetch';

const orderCartMap = global.orderCartMap || new Map();

export default async function handler(req, res) {
  console.log('[verify-order] handler start - method:', req.method, 'query:', req.query)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = req.query.orderId || req.query.order_id;
  console.log('[verify-order] orderId param:', orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'orderId query parameter required' });
  }

  const CF_BASE = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  const url = `${CF_BASE}/orders/${encodeURIComponent(orderId)}`;
  console.log('[verify-order] Fetching Cashfree order status from:', url);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION,
        'x-client-id': process.env.CASHFREE_CLIENT_ID,
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
      },
    });

    const data = await response.json();
    console.log('[verify-order] response status:', response.status, 'data:', data);
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[verify-order] error during fetch:', err);
    return res.status(500).json({ error: 'server error', details: String(err) });
  }
}


