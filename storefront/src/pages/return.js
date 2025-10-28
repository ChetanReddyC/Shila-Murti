// pages/return.js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

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
        // Complete the Medusa cart and then navigate to Thank You page
        try {
          // Resolve customer id from session (if available)
          let customerId = null;
          try {
            const sessRes = await fetch('/api/auth/session');
            const sess = await sessRes.json().catch(() => ({}));
            customerId = sess?.customerId || (sess?.user && sess.user.customerId) || null;
          } catch {}

          // Try multiple sources for cart ID
          let mappedCartId = cartIdParam;
          
          // 1. Try window.__orderCartMap
          if (!mappedCartId && window.__orderCartMap && orderIdParam) {
            mappedCartId = window.__orderCartMap[orderIdParam];
          }
          
          // 2. Try sessionStorage
          if (!mappedCartId && orderIdParam) {
            try {
              const stored = sessionStorage.getItem(`cashfree:${orderIdParam}:cartId`);
              if (stored) mappedCartId = stored;
            } catch {}
          }
          
          // 3. Try localStorage as fallback
          if (!mappedCartId && orderIdParam) {
            try {
              const stored = localStorage.getItem(`cashfree:${orderIdParam}:cartId`);
              if (stored) mappedCartId = stored;
            } catch {}
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
            // Last resort: Try API with just orderId - backend will try to resolve from KV
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
          
          // Store order result for confirmation page
          if (createdOrderId) {
            try {
              sessionStorage.setItem('order_result', JSON.stringify({
                orderId: createdOrderId,
                displayId: completeJson?.result?.order?.display_id
              }));
            } catch {}
          }
          
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
  }, [router.isReady, orderIdParam, router]);

  if (!orderIdParam) {
    return <div>Order ID missing in URL</div>;
  }

  return (
    <>
      <Head>
        <title>Processing Payment - Shila Murthi</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      </Head>
      
      <style jsx>{`
        @keyframes radial-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        @keyframes fill-radial-progress {
          0% { --progress: 0%; }
          100% { --progress: 100%; }
        }
        .radial-progress {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: conic-gradient(
            #111827 0% var(--progress),
            #e5e7eb var(--progress) 100%
          );
          --progress: 0%;
          animation: fill-radial-progress 8s linear forwards, radial-pulse 2s ease-in-out infinite;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .radial-progress::before {
          content: '';
          position: absolute;
          width: calc(100% - 10px);
          height: calc(100% - 10px);
          background-color: #F9FAFB;
          border-radius: 50%;
          z-index: 1;
        }
        .help-tooltip {
          display: none;
          visibility: hidden;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .help-icon:hover .help-tooltip {
          display: block;
          visibility: visible;
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh', 
        fontFamily: 'Inter, sans-serif',
        backgroundColor: '#F9FAFB',
        color: '#1F2937'
      }}>
        <main style={{ 
          flexGrow: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <div style={{ 
            maxWidth: '28rem', 
            width: '100%', 
            textAlign: 'center', 
            padding: '2rem' 
          }}>
            <div style={{ 
              marginBottom: '1.5rem', 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <div className="radial-progress">
                <span className="material-icons-outlined" style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: '#9CA3AF',
                  fontSize: '2rem',
                  zIndex: 20
                }}>payments</span>
              </div>
              <div className="help-icon" style={{ 
                position: 'relative', 
                marginTop: '2rem', 
                cursor: 'pointer' 
              }}>
                <button aria-label="Help with payment processing" style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  color: '#6B7280',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}>
                  <span className="material-symbols-outlined" style={{ 
                    fontSize: '1.125rem', 
                    marginRight: '0.25rem' 
                  }}>help</span>
                  <span>Payment taking too long?</span>
                </button>
                <div className="help-tooltip" style={{
                  position: 'absolute',
                  zIndex: 30,
                  width: '18rem',
                  padding: '1rem',
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '0.5rem',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-0.5rem)',
                  marginTop: '0.75rem',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  color: '#374151'
                }}>
                  <p style={{ 
                    fontWeight: '600', 
                    marginBottom: '0.5rem', 
                    color: '#111827' 
                  }}>Common Issues &amp; FAQs:</p>
                  <ul style={{ 
                    listStyleType: 'disc', 
                    paddingLeft: '1.5rem',
                    margin: 0
                  }}>
                    <li style={{ marginBottom: '0.25rem' }}>Double-check your internet connection.</li>
                    <li style={{ marginBottom: '0.25rem' }}>Ensure payment details are correct.</li>
                    <li style={{ marginBottom: '0.25rem' }}>Contact your bank if the issue persists.</li>
                    <li style={{ marginBottom: '0.25rem' }}>
                      <a href="#" style={{ color: '#2563EB', textDecoration: 'underline' }}>Visit our help center</a> for more.
                    </li>
                  </ul>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%) translateY(-50%) rotate(45deg)',
                    width: '0.75rem',
                    height: '0.75rem',
                    backgroundColor: 'white',
                    borderTop: '1px solid #E5E7EB',
                    borderLeft: '1px solid #E5E7EB'
                  }}></div>
                </div>
              </div>
            </div>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: '#111827', 
              marginBottom: '0.5rem' 
            }}>Processing your payment...</h1>
            <p style={{ color: '#4B5563' }}>
              Please do not close this window or press the back button.
            </p>
            <p style={{ color: '#4B5563', marginTop: '0.25rem' }}>
              You will be redirected to the order confirmation page shortly.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}


