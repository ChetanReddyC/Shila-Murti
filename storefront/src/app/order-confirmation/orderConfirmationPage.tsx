'use client';

import React, { useState, useEffect } from 'react';
import Header from '../../components/Header';
import styles from './orderConfirmationPage.module.css';
import cartStyles from '../cart/cartPage.module.css';

export default function OrderConfirmationPage() {
  // Use state to store values that will be set on the client side
  const [orderNumber, setOrderNumber] = useState('#000000');
  const [currentDate, setCurrentDate] = useState('');
  const [deliveryRange, setDeliveryRange] = useState('');
  
  // Use useEffect to run date calculations only on the client side
  useEffect(() => {
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
  }, []);

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
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={cartStyles.itemCell}>
                      <span className={styles.itemName}>Stone Idol of Ganesha</span>
                    </td>
                    <td className={cartStyles.quantityCell}>1</td>
                    <td className={cartStyles.priceCell}>$50.00</td>
                  </tr>
                  <tr>
                    <td className={cartStyles.itemCell}>
                      <span className={styles.itemName}>Stone Idol of Lakshmi</span>
                    </td>
                    <td className={cartStyles.quantityCell}>1</td>
                    <td className={cartStyles.priceCell}>$60.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h2 className={styles.sectionTitle}>Shipping Information</h2>
            <div className={styles.summaryContainer}>
              <div className={styles.shippingItem}>
                <span className={styles.label}>Delivery Address</span>
                <span className={styles.value}>123 Temple Street, Anytown, CA 91234</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.label}>Shipping Method</span>
                <span className={styles.value}>Standard Shipping</span>
              </div>
            </div>
            <h2 className={styles.sectionTitle}>Payment Summary</h2>
            <div className={styles.paymentGrid}>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Subtotal</span>
                <span className={styles.paymentValue}>$110.00</span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Shipping</span>
                <span className={styles.paymentValue}>$5.00</span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Taxes</span>
                <span className={styles.paymentValue}>$10.00</span>
              </div>
              <div className={styles.paymentItem}>
                <span className={styles.paymentLabel}>Total</span>
                <span className={styles.paymentValue}>$125.00</span>
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