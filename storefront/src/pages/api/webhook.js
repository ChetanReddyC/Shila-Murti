// pages/api/webhook.js
import crypto from 'crypto';
import fetch from 'node-fetch';

// Dynamic imports for ES modules
const captureCashfreePaymentPromise = import('../../utils/cashfreeCapture.ts').then(m => m.captureCashfreePayment).catch(() => null);
const preventWebhookReplayPromise = import('../../utils/orderCompletionGuard.ts').then(m => m.preventWebhookReplay).catch(() => null);
const acquireCompletionLockPromise = import('../../utils/orderCompletionGuard.ts').then(m => m.acquireCompletionLock).catch(() => null);
const getCartIdFromOrderPromise = import('../../utils/orderCompletionGuard.ts').then(m => m.getCartIdFromOrder).catch(() => null);
const medusaCapturePromise = import('../../utils/medusaPaymentCapture.ts').catch(() => null);

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
    console.warn('[WEBHOOK][security][missing_headers]', { hasSignature: Boolean(signature), hasTimestamp: Boolean(timestamp) });
    return res.status(400).end('Missing signature or timestamp');
  }

  // Security: Prevent replay attacks
  try {
    const preventReplay = await preventWebhookReplayPromise;
    if (preventReplay) {
      const replayCheck = await preventReplay(signature, timestamp);
      if (!replayCheck.allowed) {
        console.warn('[WEBHOOK][security][replay_blocked]', { reason: replayCheck.reason, timestamp });
        return res.status(400).end('Replay attack detected');
      }
    }
  } catch (replayError) {
    console.error('[WEBHOOK][security][replay_check_error]', { error: String(replayError) });
  }

  const payloadToSign = `${timestamp}.${raw.toString()}`;
  const expected = crypto.createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
    .update(payloadToSign)
    .digest('base64');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  const valid = expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!valid) {
    console.error('[WEBHOOK][security][invalid_signature]', { timestamp });
    return res.status(400).end('Invalid signature');
  }

  console.log('[WEBHOOK][security][validated]', { timestamp });

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
    const orderAmount = Number(data?.order?.order_amount || data?.order_amount || 0)

    console.log('[WEBHOOK][received]', { orderId, status, orderAmount, type });

    if (orderId && status === 'PAID') {
      // Security: Get cart ID and check if already completed
      let cartId = null;
      try {
        const getCartId = await getCartIdFromOrderPromise;
        if (getCartId) {
          cartId = await getCartId(orderId);
          console.log('[WEBHOOK][cart_resolved]', { orderId, cartId });
        }
      } catch (err) {
        console.error('[WEBHOOK][cart_resolve_error]', { orderId, error: String(err) });
      }

      // Security: Acquire lock if we have cartId
      if (cartId) {
        try {
          const acquireLock = await acquireCompletionLockPromise;
          if (acquireLock) {
            const lockResult = await acquireLock(cartId, orderId);
            if (!lockResult.allowed) {
              console.warn('[WEBHOOK][completion_blocked]', { 
                orderId, 
                cartId, 
                reason: lockResult.reason,
                existingOrderId: lockResult.existingOrderId 
              });
              // Already completed, return success to prevent retry
              return res.status(200).json({ ok: true, message: 'Already processed' });
            }
          }
        } catch (lockErr) {
          console.error('[WEBHOOK][lock_error]', { orderId, cartId, error: String(lockErr) });
        }
      }

      // Attempt to capture payment before completing cart (only if enabled)
      const autoCaptureEnabled = process.env.CASHFREE_AUTO_CAPTURE === 'true'
      if (autoCaptureEnabled) {
        try {
          const captureFn = await captureCashfreePaymentPromise
          if (captureFn && orderAmount > 0) {
            const captureResult = await captureFn(orderId, orderAmount)
            console.log('[WEBHOOK][cashfree_capture]', { orderId, success: captureResult.success });
            
            if (!captureResult.success) {
              const isNotEnabled = 
                captureResult.error?.includes('not enabled') || 
                captureResult.data?.message?.includes('not enabled');
              if (isNotEnabled) {
                console.info('[WEBHOOK][capture_not_enabled]', { 
                  message: 'Preauthorization not enabled. Using direct settlement.',
                  orderId 
                });
              }
            }
          }
        } catch (captureErr) {
          console.error('[WEBHOOK][cashfree_capture][error]', { orderId, error: String(captureErr) });
        }
      }

      // Complete the cart via app route
      const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'
      try {
        const completeResponse = await fetch(`${origin}/api/checkout/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
        
        const completeData = await completeResponse.json().catch(() => ({}));
        console.log('[WEBHOOK][complete_response]', { 
          orderId, 
          status: completeResponse.status,
          ok: completeResponse.ok,
          data: completeData 
        });
      } catch (e) {
        console.error('[WEBHOOK][complete_error]', { orderId, error: String(e) });
      }
    } else {
      console.log('[WEBHOOK][ignored]', { orderId, status, reason: 'Not PAID status' });
    }
  } catch (e) {
    console.error('[WEBHOOK][error]', { error: String(e) });
  }

  return res.status(200).json({ ok: true });
}


