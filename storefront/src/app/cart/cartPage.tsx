'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import styles from './cartPage.module.css';
import Link from 'next/link';

// Real product data from the products page
const products = [
  {
    id: 1,
    name: "Stone Idol 1, handcrafted",
    price: 50,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDLuyJZ0xxw_l9UUZPYMMLIG5k9I8fiVs6lcmflwE_12DaUsTg9Zz4nHSGXRPCWuHcGg4SgqHcaFm5a2_OlvZj6CgnY-9pNDVRy1WIJbv-LWBQ6lE_k-teSL6Da366eZQ323rHVwrTqos9EKSJ5ucUGKwNhtdwJUbaznsE3Cu0SrlKj-M76eTRkXlyudU1atflukUlrRQe7bxiAY2yA5vrHir7LVQrFeRh1mDe9IrNGiY-uJvCQPWB2_GI_YqTIEF9MvM-HuI1oleSI"
  },
  {
    id: 2,
    name: "Stone Idol 2, handcrafted",
    price: 50,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAeQzk8rzneSZ7TOpCnxMrIE4B22ojfpsBUr4bcaPZ-i6WBGRa2F26vgUS7ybGR78YvgWjlEwMwJLG-zE-j3MzavNi0qh7nAMkrRnAq_8QYEyteHzuUSenoX0ri2lx6c53fFwxqA3W5F1SKYQVGDVsGYyTZRFaUHD0RCLCL1pQpeg7FYf4_Y3D06GK0MUsi4ZfQjjXiHMc59qAc47S2WqpIo4Zq9YFLZoYeCfei0D15sZt7WWJBR7ntlMzYxIjWgOBEMQyASPxMfWFy"
  },
  {
    id: 3,
    name: "Nandi Bull",
    price: 75,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAaxQQ9aq5Z9ZuyzglS8RGOochTnPmKkVt-ld6SiLqNhLlV8CCrK1rcGjRchYf1XKJo7K_mVVO8ODSc63R3Ke74rYZxYuqxWLGCSXU7GZyh-Bi8Eq_eAeV-XWCqXt8KOci3lVv2GvM5IVhqZr8vILrHOVl2ljtGeTKgjjwBbkl8eG6KSTPs2tjWFOAFKqXkPEAGzK3H5mdf2P7D58iKxKaaEGZqhKkCULAs4WzlKgGefSpucQCx4tlFgpJAo_emV6UKBQ7cMi8Q9MBH"
  },
  {
    id: 4,
    name: "Elephant Sculpture",
    price: 65,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAd9aVpRHcaPbV_eSzV96JMEI7ywpFgBPhIelaXIP-wL83Dol90y4HV-5l5C9rlo-vNeVtp5asvd709OCdISDTJ6C3_eo6kOBOBpaalXX1Jy0f16d4vLzzvm0DLtEispUiyumtDYUNR4-V7njf7G8VS3Ajid6ihoAJuB4h_lGowxWXgpXAelOagPdc0UM5D9nyFn4e8mhWR9YPQcy37ciov0FF7hsh-C6OQR8pZe9ZTLHkuD1ojrJdZXxZeZMo_P_7RLuzyezUU3k75"
  }
];

export default function CartPage() {
  // Cart items - first two products from the products array
  const cartItems = [
    {
      ...products[0],
      quantity: 1
    },
    {
      ...products[1],
      quantity: 2
    }
  ];
  
  // Calculate subtotal
  const subtotal = 150;
  
  // Shipping is free as shown in the screenshot
  const shipping = 'Free';
  
  // Total amount
  const total = 150;

  return (
    <div 
      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header />
        
        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <div className={styles.container}>
            <h1 className={styles.title}>Shopping Cart</h1>
            
            {/* Cart table */}
            <div className={styles.itemsBox}>
              <table className={styles.cartTable}>
                <thead className={styles.cartTableHeader}>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.itemCell}>
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            className={styles.itemImage}
                          />
                          <span className={styles.itemName}>{item.name}</span>
                        </div>
                      </td>
                      <td className={styles.priceCell}>${item.price}</td>
                      <td className={styles.quantityCell}>{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Order Summary */}
            <div className={styles.orderSummary}>
              <h2 className={styles.orderSummaryTitle}>Order Summary</h2>
              
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Subtotal</span>
                <span className={styles.summaryValue}>${subtotal}</span>
              </div>
              
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Shipping</span>
                <span className={styles.summaryValue}>{shipping}</span>
              </div>
              
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalValue}>${total}</span>
              </div>
            </div>
            
            {/* Buttons */}
            <div className={styles.buttonsContainer}>
              <Link href="/products" className="w-full sm:w-auto">
                <button className={styles.continueShoppingButton}>
                  Continue Shopping
                </button>
              </Link>
              
              <Link href="/checkout" className="w-full sm:w-auto">
                <button className={styles.checkoutButton}>
                  Proceed to Checkout
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 