// pages/return.js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PaymentProcessingScreen from '../components/PaymentProcessingScreen';

export default function ReturnPage() {
  const router = useRouter();
  const { order_id, orderId, cart_id } = router.query;
  const orderIdParam = order_id || orderId;
  const cartIdParam = cart_id;

  const [status, setStatus] = useState('checking');
  const [orderData, setOrderData] = useState(null);

  useEffect(() => {
    if (!router.isReady || !orderIdParam) return;
    (async () => {
      const resp = await fetch(`/api/verify-order?orderId=${encodeURIComponent(orderIdParam)}`);
      const json = await resp.json();
      setOrderData(json);
      if (resp.ok && json.order_status === 'PAID') {
        setStatus('paid');
        try {
          let customerId = null;
          try {
            const sessRes = await fetch('/api/auth/session');
            const sess = await sessRes.json().catch(() => ({}));
            customerId = sess?.customerId || (sess?.user && sess.user.customerId) || null;
          } catch { }

          let mappedCartId = cartIdParam;

          if (!mappedCartId && window.__orderCartMap && orderIdParam) {
            mappedCartId = window.__orderCartMap[orderIdParam];
          }

          if (!mappedCartId && orderIdParam) {
            try {
              const stored = sessionStorage.getItem(`cashfree:${orderIdParam}:cartId`);
              if (stored) mappedCartId = stored;
            } catch { }
          }

          if (!mappedCartId && orderIdParam) {
            try {
              const stored = localStorage.getItem(`cashfree:${orderIdParam}:cartId`);
              if (stored) mappedCartId = stored;
            } catch { }
          }

          console.log('[RETURN_PAGE] Cart ID resolution:', {
            cartIdParam,
            mappedCartId,
            orderIdParam,
            hasWindowMap: !!(window.__orderCartMap && window.__orderCartMap[orderIdParam])
          });

          console.log('[RETURN_PAGE] About to call complete API with:', {
            mappedCartId,
            orderIdParam,
            customerId,
            hasCustomerId: !!customerId
          });

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
            console.warn('[RETURN_PAGE] No cartId found, trying API with orderId only');
            completeRes = await fetch(`/api/checkout/complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }
          const completeJson = await completeRes.json().catch(() => ({}))

          console.log('[RETURN_PAGE] Complete API response:', {
            ok: completeRes.ok,
            status: completeRes.status,
            hasOrder: !!completeJson?.result?.order,
            hasError: !!completeJson?.error,
            completeJson
          });

          if (!completeRes.ok) {
            console.error('[RETURN_PAGE] Order completion failed:', completeJson);
            setStatus('completion_failed');
            return;
          }

          const createdOrderId = completeJson?.result?.order?.id

          if (createdOrderId) {
            try {
              sessionStorage.setItem('order_result', JSON.stringify({
                orderId: createdOrderId,
                displayId: completeJson?.result?.order?.display_id
              }));
            } catch { }
          }

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
  }, [router.isReady, orderIdParam, router, cartIdParam]);

  if (!orderIdParam) {
    return <div>Order ID missing in URL</div>;
  }

  return (
    <>
      <Head>
        <title>Processing Payment - Shila Murti</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      </Head>

      <PaymentProcessingScreen />
    </>
  );
}
