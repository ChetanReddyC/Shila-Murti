'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic'
import styles from './orderConfirmationPage.module.css';
import cartStyles from '../cart/cartPage.module.css';
import { useCart } from '../../contexts/CartContext';
import { medusaApiClient } from '../../utils/medusaApiClient';
import { useSearchParams, useRouter } from 'next/navigation';

import { getCustomerId as getCustomerIdHybrid } from '../../utils/hybridCustomerStorage';

export default function OrderConfirmationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Use cart context for silent clearing; capture cart once for fallback display
  const { clearCartSilently, cart } = useCart();
  const [fallbackCart, setFallbackCart] = useState<any | null>(null);

  // Snapshot from checkout (preferred for display)
  const [snapshot, setSnapshot] = useState<null | {
    data: any;
    expiresAt: number;
  }>(null);

  // Real order data if available
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('#000000');
  const [currentDate, setCurrentDate] = useState('');
  const [deliveryRange, setDeliveryRange] = useState('');
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [orderItems, setOrderItems] = useState<any[] | null>(null);
  const [orderTotals, setOrderTotals] = useState<{ subtotal: number; shipping: number; taxes: number; total: number } | null>(null);
  const [orderAddress, setOrderAddress] = useState<any | null>(null)
  const [orderShippingMethodName, setOrderShippingMethodName] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false);

  // Use useEffect to run date calculations and load order/snapshot on the client side
  useEffect(() => {
    // Clear cart immediately (lock removed - backend guard handles protection)
    try { void clearCartSilently() } catch (e) { }
    // Capture cart once at mount to keep UI stable regardless of later cart updates
    setFallbackCart(cart ?? null);

    const urlOrderId = searchParams?.get('order_id') ?? null;

    // Try to read order result from session as set by checkout
    try {
      const rawResult = sessionStorage.getItem('order_result');
      if (rawResult) {
        try {
          const parsed = JSON.parse(rawResult);
          if (parsed?.orderId) {
            setOrderId(parsed.orderId);
            if (typeof parsed.displayId === 'number') {
              setOrderNumber(`#${String(parsed.displayId).padStart(6, '0')}`);
            }
          }
        } catch (parseErr) {
          try { sessionStorage.removeItem('order_result') } catch { }
        }
      }
    } catch { }

    if (urlOrderId && !orderId) {
      setOrderId(urlOrderId);
    }

    // Load order snapshot from sessionStorage (if present and not expired)
    try {
      const raw = sessionStorage.getItem('order_checkout_snapshot');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.expiresAt && parsed?.expiresAt > Date.now()) {
            setSnapshot(parsed);
          } else {
            // Expired, remove it
            sessionStorage.removeItem('order_checkout_snapshot');
          }
        } catch (parseErr) {
          try { sessionStorage.removeItem('order_checkout_snapshot') } catch { }
        }
      }
    } catch (e) {
    }

    // FIX M13: Don't overwrite real order number with random one
    // Only set placeholder if no real display_id was loaded from session storage above
    setOrderNumber(prev => prev === '#000000'
      ? '#------'  // Show placeholder instead of misleading random number
      : prev
    );

    // Format current date
    const today = new Date();
    setCurrentDate(today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

    // Calculate delivery date range
    const deliveryStart = new Date(today);
    deliveryStart.setDate(today.getDate() + 6);
    const deliveryEnd = new Date(today);
    deliveryEnd.setDate(today.getDate() + 10);
    const startStr = deliveryStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const endStr = deliveryEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    setDeliveryRange(`${startStr} - ${endStr}`);

    // Fetch order details if orderId available
    const fetchOrder = async () => {
      if (!orderId && !urlOrderId) {
        setOrderLoaded(true);
        return;
      }
      try {
        const id = urlOrderId || orderId!;
        const order = await medusaApiClient.getOrder(id);
        // Populate display fields if available
        if (typeof order.display_id === 'number') {
          setOrderNumber(`#${String(order.display_id).padStart(6, '0')}`);
        }
        setOrderItems(order.items || null);
        setOrderTotals({
          subtotal: Number(order.subtotal || 0),
          shipping: Number(order.shipping_total || 0),
          taxes: Number(order.tax_total || 0),
          total: Number(order.total || 0),
        });
        // Capture shipping address & method from order (preferred source)
        try {
          const shipAddr: any = (order as any)?.shipping_address || null
          setOrderAddress(shipAddr)
          const methodName: string | null = (order as any)?.shipping_methods?.[0]?.name || null
          setOrderShippingMethodName(methodName)
        } catch { }
      } catch (err) {
      } finally {
        setOrderLoaded(true);
      }
    };

    fetchOrder();

    // Do not clear snapshot/order_result immediately; keep them available while on this page
    // to avoid race conditions with session/login events. We can clear them when the user
    // leaves the page or on a later visit.
    const clearSnapshotTimer = setTimeout(() => {
      // Intentionally disabled immediate clearing
    }, 0);

    return () => {
      clearTimeout(clearSnapshotTimer);
    };
  }, [clearCartSilently]);

  // Download invoice handler
  const downloadInvoice = async () => {
    if (!orderId) return;

    // SECURITY: Get customer ID from secure httpOnly cookie via API
    const result = await getCustomerIdHybrid();
    if (!result.ok || !result.customerId) {
      alert('Unable to download invoice: Customer not found');
      return;
    }

    setIsDownloading(true);

    // Method 1: Direct iframe download (most reliable, bypasses ad blockers)
    const tryDirectDownload = () => {
      try {
        const url = `/api/account/orders/${orderId}/invoices`;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        // Remove iframe after download starts
        setTimeout(() => {
          try {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 2000);

        return true;
      } catch (e) {
        console.error('Direct download failed:', e);
        return false;
      }
    };

    // Method 2: Blob download (better UX when it works)
    const tryBlobDownload = async () => {
      const response = await fetch(`/api/account/orders/${orderId}/invoices`, {
        method: 'GET',
        headers: {
          'accept': 'application/pdf',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      // Use modern API if available
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          // @ts-ignore - trigger save dialog
          const handle = await window.showSaveFilePicker({
            suggestedName: `invoice-${orderNumber.replace('#', '')}.pdf`,
            types: [{
              description: 'PDF Document',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (e) {
          // User cancelled or browser doesn't support, fall through to blob URL
        }
      }

      // Fallback: blob URL download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${orderNumber.replace('#', '')}.pdf`;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);

      setTimeout(() => {
        try {
          a.click();
        } catch (e) {
          // If click fails, try opening in new tab
          window.open(url, '_blank');
        }

        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
        }, 150);
      }, 50);

      return true;
    };

    let downloadSuccess = false;

    try {
      // Try blob download first (better UX with save dialog)
      downloadSuccess = await tryBlobDownload();
    } catch (error: any) {
      // Check if it's a fetch error (likely ad blocker or CORS)
      const errorMessage = error?.message || '';
      const isFetchError = errorMessage.includes('fetch') ||
        errorMessage.includes('blocked') ||
        errorMessage.includes('ERR_BLOCKED') ||
        error?.name === 'TypeError';

      if (isFetchError) {
        // Silently fall back to iframe method (expected behavior with ad blockers)
        downloadSuccess = tryDirectDownload();
      } else {
        // Actual server error - show to user
        console.error('Download failed with server error:', error);
        alert(`Failed to download invoice: ${errorMessage}. Please try again or contact support.`);
      }
    } finally {
      // Keep loading state a bit longer for iframe downloads
      setTimeout(() => setIsDownloading(false), downloadSuccess ? 500 : 100);
    }
  };


  return (
    <div className={styles.pageWrapper}>
      <div className={styles.mainLayout}>
        <div className={styles.contentWrapper}>
          <div className={styles.container}>
<h1 className={styles.title}>Thank you for your order!</h1>
            <p className={styles.description}>Your order has been placed. You will receive an email shortly.</p>
            <h2 className={styles.sectionTitle}>Order Summary</h2>
            <div className={styles.summaryContainer}>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Order Number</span>
                <span className={styles.value}>{orderNumber}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Date of Purchase</span>
                <span className={styles.value}>{currentDate}</span>
              </div>
            </div>
            {/* Order Items Table (prefer real order, then snapshot, then captured cart at mount) */}
            <div className={`${cartStyles.itemsBox} ${styles.responsiveTable}`}>
              <table className={cartStyles.cartTable}>
                <thead className={cartStyles.cartTableHeader}>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(orderItems ?? snapshot?.data?.items ?? fallbackCart?.items ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td className={cartStyles.itemCell}>
                        <span className={styles.itemName}>{item?.title ?? 'Item'}</span>
                      </td>
                      <td className={cartStyles.quantityCell}>{item.quantity}</td>
                      <td className={cartStyles.priceCell}>
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                          Number(item.unit_price || item.subtotal || 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2 className={styles.sectionTitle}>Customer & Shipping Information</h2>
            <div className={styles.summaryContainer}>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Name</span>
                <span className={styles.value}>
                  {(orderAddress?.first_name || orderAddress?.last_name)
                    ? `${orderAddress?.first_name ?? ''} ${orderAddress?.last_name ?? ''}`.trim()
                    : (snapshot?.data?.customer?.name
                      ?? (fallbackCart as any)?.shipping_address?.first_name
                      ?? '—')}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Contact Number</span>
                <span className={styles.value}>
                  {orderAddress?.phone
                    ?? snapshot?.data?.customer?.contactNumber
                    ?? (fallbackCart as any)?.shipping_address?.phone
                    ?? '—'}
                </span>
              </div>
              <div className={styles.shippingItem}>
                <span className={styles.label}>Address</span>
                <span className={styles.value}>
                  {orderAddress?.address_1
                    ?? (snapshot?.data?.customer
                      ? `${snapshot.data.customer.address ?? ''}`.trim() || '—'
                      : (fallbackCart as any)?.shipping_address?.address_1)
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>City</span>
                <span className={styles.value}>
                  {orderAddress?.city
                    ?? snapshot?.data?.customer?.city
                    ?? (fallbackCart as any)?.shipping_address?.city
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>State</span>
                <span className={styles.value}>
                  {orderAddress?.province
                    ?? snapshot?.data?.customer?.state
                    ?? (fallbackCart as any)?.shipping_address?.province
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Postal Code</span>
                <span className={styles.value}>
                  {orderAddress?.postal_code
                    ?? snapshot?.data?.customer?.postalCode
                    ?? (fallbackCart as any)?.shipping_address?.postal_code
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Shipping Method</span>
                <span className={styles.value}>
                  {orderShippingMethodName
                    ?? (snapshot?.data?.shippingSelection?.method
                      ? (snapshot.data.shippingSelection.method === 'express'
                        ? 'Express'
                        : snapshot.data.shippingSelection.method === 'expedited'
                          ? 'Expedited'
                          : 'Standard')
                      : (fallbackCart as any)?.shipping_methods?.[0]?.name)
                    ?? '—'}
                </span>
              </div>
            </div>
            <h2 className={styles.sectionTitle}>Payment Summary</h2>
            <div className={styles.paymentGrid}>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Subtotal</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(orderTotals?.subtotal ?? snapshot?.data?.totals?.subtotal ?? fallbackCart?.subtotal ?? 0)
                  )}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Shipping</span>
                <span className={styles.paymentValue}>
                  {Number(orderTotals?.shipping ?? snapshot?.data?.totals?.shipping ?? fallbackCart?.shipping_total ?? 0) > 0
                    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                      Number(orderTotals?.shipping ?? snapshot?.data?.totals?.shipping ?? fallbackCart?.shipping_total ?? 0)
                    )
                    : 'Free'}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Taxes</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(orderTotals?.taxes ?? snapshot?.data?.totals?.taxes ?? fallbackCart?.tax_total ?? 0)
                  )}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Total</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(
                      orderTotals?.total ?? snapshot?.data?.totals?.total ??
                      (
                        Number(orderTotals?.subtotal ?? snapshot?.data?.totals?.subtotal ?? fallbackCart?.subtotal ?? 0) +
                        Number(orderTotals?.shipping ?? snapshot?.data?.totals?.shipping ?? fallbackCart?.shipping_total ?? 0) +
                        Number(orderTotals?.taxes ?? snapshot?.data?.totals?.taxes ?? fallbackCart?.tax_total ?? 0)
                      )
                    )
                  )}
                </span>
              </div>
            </div>
            <p className={styles.estimatedDelivery}>Estimated Delivery: {deliveryRange}</p>
            <div className={styles.buttonsContainer}>
              <button
                className={styles.downloadButton}
                onClick={downloadInvoice}
                disabled={isDownloading || !orderId}
              >
                {isDownloading ? 'Downloading...' : 'Download Invoice'}
              </button>
              <button
                className={`${styles.viewButton} ${styles.responsiveButton}`}
                onClick={() => orderId && router.push(`/account/orders/${orderId}`)}
                disabled={!orderId}
              >
                View Order Details
              </button>
            </div>
            <p className={styles.contactInfo}>For any questions, please contact our customer support at support@shilamurthi.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}

