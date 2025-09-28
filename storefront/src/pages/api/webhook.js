// pages/api/webhook.js
import crypto from 'crypto';
import fetch from 'node-fetch';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);


  const signature = (req.headers['x-webhook-signature'] || req.headers['x-cashfree-signature'] || '').toString();
  const timestamp = (req.headers['x-webhook-timestamp'] || '').toString();

  if (!signature || !timestamp) {
    return res.status(400).end('Missing signature or timestamp');
  }

  const payloadToSign = `${timestamp}.${raw.toString()}`;
  const expected = crypto.createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
    .update(payloadToSign)
    .digest('base64');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  const valid = expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);


  if (!valid) {
    return res.status(400).end('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(raw.toString());
  } catch (err) {
    return res.status(400).end('Invalid JSON');
  }


  // Business logic: update your order status in database, etc.
  try {
    const type = String(body?.type || body?.event || '')
    const data = body?.data || body
    const orderId = String(data?.order?.order_id || data?.order_id || '')
    const status = String(data?.order?.order_status || data?.order_status || '').toUpperCase()

    if (orderId && status === 'PAID') {
      // Ask the app route to complete the cart via KV mapping if available
      const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'
      try {
        await fetch(`${origin}/api/checkout/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        })
      } catch (e) {
      }
    }
  } catch (e) {
  }

  return res.status(200).json({ ok: true });
}


