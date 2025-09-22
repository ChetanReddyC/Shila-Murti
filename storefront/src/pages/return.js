// pages/return.js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function ReturnPage() {
  const router = useRouter();
  const { order_id, orderId, cart_id } = router.query;
  const orderIdParam = order_id || orderId;
  const cartIdParam = cart_id;

  const [status, setStatus] = useState('checking');
  const [orderData, setOrderData] = useState(null);

  useEffect(() => {
    console.log('[return] router.query:', router.query, 'orderIdParam:', orderIdParam, 'cartIdParam:', cartIdParam);
    console.log('[return] useEffect start for orderIdParam')
    if (!orderIdParam) return;
    (async () => {
      console.log('[return] fetching verify-order for:', orderIdParam)
      const resp = await fetch(`/api/verify-order?orderId=${encodeURIComponent(orderIdParam)}`);
      console.log('[return] verify-order resp.ok:', resp.ok);
      console.log('[return] verify-order response status:', resp.status)
      const json = await resp.json();
      console.log('[return] verify-order data:', json)
      setOrderData(json);
      if (resp.ok && json.order_status === 'PAID') {
        console.log('[return] order_status is PAID, proceeding to complete cart');
        setStatus('paid');
        // Complete the Medusa cart and then navigate to Thank You page
        try {
          console.log('[return] triggering complete-cart for orderIdParam:', orderIdParam, 'cartIdParam:', cartIdParam)
          const mappedCartId = cartIdParam || (window.__orderCartMap && window.__orderCartMap[orderIdParam]);
          console.log('[return] window.__orderCartMap:', window.__orderCartMap, 'mappedCartId:', mappedCartId);
          let completeRes;
          if (mappedCartId) {
            console.log('[return] found mappedCartId, calling complete-cart with query')
            completeRes = await fetch(`/api/checkout/complete?cartId=${encodeURIComponent(String(mappedCartId))}`, { method: 'POST' });
          } else {
            console.log('[return] no mappedCartId, posting orderId for complete-cart')
            completeRes = await fetch(`/api/checkout/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderIdParam }) });
          }
          const completeJson = await completeRes.json().catch(() => ({}))
          console.log('[return] complete-cart raw response.ok:', completeRes.ok);
          console.log('[return] complete-cart response:', completeRes.status, completeJson)
          const createdOrderId = completeJson?.result?.order?.id
          // Navigate to our Thank You page regardless; pass order_id if we have it
          console.log('[return] computed redirect destination for createdOrderId:', createdOrderId);
          const dest = createdOrderId
            ? `/order-confirmation?order_id=${encodeURIComponent(createdOrderId)}`
            : '/order-confirmation'
          console.log('[return] redirecting to:', dest)
          if (typeof window !== 'undefined') {
            window.location.assign(dest)
          } else {
            router.replace(dest)
          }
        } catch (e) {
          console.error('[return] complete-cart error details:', e);
          console.warn('[return] complete-cart error, redirecting to thank you anyway', e)
          if (typeof window !== 'undefined') {
            window.location.assign('/order-confirmation')
          } else {
            router.replace('/order-confirmation')
          }
        }
      } else {
        console.log('[return] not paid or verify failed, setting status to not_paid');
        setStatus('not_paid');
      }
    })();
  }, [orderIdParam]);

  if (!orderIdParam) {
    return <div>Order ID missing in URL</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Processing your payment…</h1>
      <p>Order: {String(orderIdParam || '')}</p>
      <p>Status: {status}</p>
      <p>You will be redirected to your order confirmation shortly.</p>
    </div>
  );
}


