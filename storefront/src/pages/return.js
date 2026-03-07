// pages/return.js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PaymentProcessingScreen from '../components/PaymentProcessingScreen';

export default function ReturnPage() {
  const router = useRouter();
  const { order_id, orderId } = router.query;
  const orderIdParam = order_id || orderId;

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

          // SECURITY FIX C7: Cart ID is resolved SERVER-SIDE from HMAC-signed mapping
          // Never trust client-side storage (sessionStorage/localStorage) for cart ID
          // The /api/checkout/complete route resolves cartId securely via getOrderCartMapping(orderId)
          const payload = {
            ...(orderIdParam ? { orderId: orderIdParam } : {}),
            ...(customerId ? { customerId } : {}),
          };

          const completeRes = await fetch(`/api/checkout/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const completeJson = await completeRes.json().catch(() => ({}));

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
  }, [router.isReady, orderIdParam, router]);

  if (!orderIdParam) {
    return <div>Order ID missing in URL</div>;
  }

  // FIX L13: Show appropriate UI based on payment status instead of always showing processing screen
  if (status === 'not_paid') {
    return (
      <>
        <Head><title>Payment Failed - Shila Murti</title></Head>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif', padding: '20px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '16px' }}>Payment Not Completed</h2>
          <p style={{ marginBottom: '24px', color: '#666' }}>Your payment was not successful. Please try again.</p>
          <a href="/checkout" style={{ padding: '12px 32px', background: '#000', color: '#fff', textDecoration: 'none', borderRadius: '4px' }}>Return to Checkout</a>
        </div>
      </>
    );
  }

  if (status === 'completion_failed') {
    return (
      <>
        <Head><title>Order Issue - Shila Murti</title></Head>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif', padding: '20px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '16px' }}>Order Processing Issue</h2>
          <p style={{ marginBottom: '8px', color: '#666' }}>Your payment was received but we encountered an issue completing your order.</p>
          <p style={{ marginBottom: '24px', color: '#666' }}>Please contact support — your payment is safe.</p>
          <a href="/order-confirmation" style={{ padding: '12px 32px', background: '#000', color: '#fff', textDecoration: 'none', borderRadius: '4px' }}>Check Order Status</a>
        </div>
      </>
    );
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
