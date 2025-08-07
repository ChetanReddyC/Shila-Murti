'use client';

import React, { useState, useEffect } from 'react';
import Header from '../../components/Header';
import styles from './orderConfirmationPage.module.css';
import cartStyles from '../cart/cartPage.module.css';
import { useCart } from '../../contexts/CartContext';

export default function OrderConfirmationPage() {
  // Pull the latest cart to display what was purchased and clear it once safely on this page
  const { cart, clearCart } = useCart();

  // Snapshot from checkout (preferred for display)
  const [snapshot, setSnapshot] = useState<null | {
    data: any;
    expiresAt: number;
  }>(null);

  // Use state to store values that will be set on the client side
  const [orderNumber, setOrderNumber] = useState('#000000');
  const [currentDate, setCurrentDate] = useState('');
  const [deliveryRange, setDeliveryRange] = useState('');
  
  // Use useEffect to run date calculations and load snapshot on the client side
  useEffect(() => {
    // Load order snapshot from sessionStorage (if present and not expired)
    try {
      const raw = sessionStorage.getItem('order_checkout_snapshot');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.expiresAt && parsed?.expiresAt > Date.now()) {
          setSnapshot(parsed);
        } else {
          // Expired, remove it
          sessionStorage.removeItem('order_checkout_snapshot');
        }
      }
    } catch (e) {
      console.warn('[OrderConfirmation] Failed to read order snapshot:', e);
    }

    // Generate random order number
    setOrderNumber(`#${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`);
    
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

    // Clear snapshot after a short delay to avoid stale re-use on subsequent navigations
    const clearSnapshotTimer = setTimeout(() => {
      try {
        sessionStorage.removeItem('order_checkout_snapshot');
      } catch {}
    }, 60 * 1000); // 1 minute

    // Gracefully clear the cart on the confirmation page to avoid flicker in Checkout.
    // We defer by a tick to ensure the page has rendered its snapshot.
    const clearCartTimer = setTimeout(() => {
      Promise.resolve()
        .then(() => clearCart())
        .catch((e) => console.warn('[OrderConfirmation] Failed to clear cart:', e));
    }, 0);

    return () => {
      clearTimeout(clearSnapshotTimer);
      clearTimeout(clearCartTimer);
    };
  }, [clearCart]);

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}>
      <div className="layout-container flex h-full grow flex-col">
        <Header />
        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <div className={styles.container}>
            <h1 className={styles.title}>Thank you for your order!</h1>
            <p className={styles.description}>Your order has been successfully placed. You will receive an email confirmation shortly with your order details.</p>
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
            {/* Order Items Table */}
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
                  {(snapshot?.data?.items ?? cart?.items ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td className={cartStyles.itemCell}>
                        <span className={styles.itemName}>{item?.title ?? 'Item'}</span>
                      </td>
                      <td className={cartStyles.quantityCell}>{item.quantity}</td>
                      <td className={cartStyles.priceCell}>
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(item.unit_price || 0))}
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
                  {snapshot?.data?.customer?.name
                    ?? (cart as any)?.shipping_address?.first_name
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Contact Number</span>
                <span className={styles.value}>
                  {snapshot?.data?.customer?.contactNumber
                    ?? (cart as any)?.shipping_address?.phone
                    ?? '—'}
                </span>
              </div>
              <div className={styles.shippingItem}>
                <span className={styles.label}>Address</span>
                <span className={styles.value}>
                  {snapshot?.data?.customer
                    ? `${snapshot.data.customer.address ?? ''}`.trim() || '—'
                    : (cart as any)?.shipping_address?.address_1 ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>City</span>
                <span className={styles.value}>
                  {snapshot?.data?.customer?.city
                    ?? (cart as any)?.shipping_address?.city
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>State</span>
                <span className={styles.value}>
                  {snapshot?.data?.customer?.state
                    ?? (cart as any)?.shipping_address?.province
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Postal Code</span>
                <span className={styles.value}>
                  {snapshot?.data?.customer?.postalCode
                    ?? (cart as any)?.shipping_address?.postal_code
                    ?? '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Shipping Method</span>
                <span className={styles.value}>
                  {snapshot?.data?.shippingSelection?.method
                    ? (snapshot.data.shippingSelection.method === 'express'
                        ? 'Express'
                        : snapshot.data.shippingSelection.method === 'expedited'
                          ? 'Expedited'
                          : 'Standard')
                    : (cart as any)?.shipping_methods?.[0]?.name ?? '—'}
                </span>
              </div>
            </div>
            <h2 className={styles.sectionTitle}>Payment Summary</h2>
            <div className={styles.paymentGrid}>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Subtotal</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(snapshot?.data?.totals?.subtotal ?? cart?.subtotal ?? 0)
                  )}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Shipping</span>
                <span className={styles.paymentValue}>
                  {Number(snapshot?.data?.totals?.shipping ?? cart?.shipping_total ?? 0) > 0
                    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                        Number(snapshot?.data?.totals?.shipping ?? cart?.shipping_total ?? 0)
                      )
                    : 'Free'}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Taxes</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(snapshot?.data?.totals?.taxes ?? cart?.tax_total ?? 0)
                  )}
                </span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Total</span>
                <span className={styles.paymentValue}>
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    Number(
                      snapshot?.data?.totals?.total ??
                      (
                        Number(snapshot?.data?.totals?.subtotal ?? cart?.subtotal ?? 0) +
                        Number(snapshot?.data?.totals?.shipping ?? cart?.shipping_total ?? 0) +
                        Number(snapshot?.data?.totals?.taxes ?? cart?.tax_total ?? 0)
                      )
                    )
                  )}
                </span>
              </div>
            </div>
            <p className={styles.estimatedDelivery}>Estimated Delivery: {deliveryRange}</p>
            <button className={`${styles.viewButton} ${styles.responsiveButton}`}>View Order Details</button>
            <p className={styles.contactInfo}>For any questions, please contact our customer support at support@shilamurthi.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
