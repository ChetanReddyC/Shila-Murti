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
    if (!orderIdParam) return;
    (async () => {
      const resp = await fetch(`/api/verify-order?orderId=${encodeURIComponent(orderIdParam)}`);
      const json = await resp.json();
      setOrderData(json);
      if (resp.ok && json.order_status === 'PAID') {
        setStatus('paid');
        // Complete the Medusa cart and then navigate to Thank You page
        try {
          // Resolve customer id from session (if available)
          let customerId = null;
          try {
            const sessRes = await fetch('/api/auth/session');
            const sess = await sessRes.json().catch(() => ({}));
            customerId = sess?.customerId || (sess?.user && sess.user.customerId) || null;
          } catch {}

          const mappedCartId = cartIdParam || (window.__orderCartMap && window.__orderCartMap[orderIdParam]);
          let completeRes;
          const payload = {
            ...(orderIdParam ? { orderId: orderIdParam } : {}),
            ...(customerId ? { customerId } : {}),
          };
          if (mappedCartId) {
            completeRes = await fetch(`/api/checkout/complete?cartId=${encodeURIComponent(String(mappedCartId))}`, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } else {
            completeRes = await fetch(`/api/checkout/complete`, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(payload) 
            });
          }
          const completeJson = await completeRes.json().catch(() => ({}))
          const createdOrderId = completeJson?.result?.order?.id
          // Navigate to our Thank You page regardless; pass order_id if we have it
          const dest = createdOrderId
            ? `/order-confirmation?order_id=${encodeURIComponent(createdOrderId)}`
            : '/order-confirmation'
          if (typeof window !== 'undefined') {
            window.location.assign(dest)
          } else {
            router.replace(dest)
          }
        } catch (e) {
          if (typeof window !== 'undefined') {
            window.location.assign('/order-confirmation')
          } else {
            router.replace('/order-confirmation')
          }
        }
      } else {
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


