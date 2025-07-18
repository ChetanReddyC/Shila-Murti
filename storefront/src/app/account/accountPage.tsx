'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import styles from './accountPage.module.css';
import Link from 'next/link';

export default function AccountPage() {
  // State to keep track of active tab
  const [activeTab, setActiveTab] = useState('Account Details');

  // Navigation items
  const navigationItems = [
    'Account Details',
    'Order History',
    'Wishlist',
    'Address Book',
    'Payment Methods'
  ];

  // Order history data
  const orders = [
    {
      id: '#12345',
      date: '2023-08-15',
      item: 'Stone Idol of Ganesha',
      status: 'Shipped'
    },
    {
      id: '#67890',
      date: '2023-07-20',
      item: 'Stone Idol of Lakshmi',
      status: 'Delivered'
    },
    {
      id: '#11223',
      date: '2023-06-05',
      item: 'Stone Idol of Shiva',
      status: 'Delivered'
    }
  ];

  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden"
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Header component */}
        <Header />
        
        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <div className={styles.container}>
            <h1 className={styles.title}>My Account</h1>
            
            <div className={styles.accountContainer}>
              {/* Navigation Tabs */}
              <div className={styles.navigationMenu}>
                {navigationItems.map((item) => (
                  <div
                    key={item}
                    className={`${styles.navItem} ${activeTab === item ? styles.navItemActive : ''}`}
                    onClick={() => setActiveTab(item)}
                  >
                    {item}
                  </div>
                ))}
              </div>
              
              {/* Account Details Section */}
              {activeTab === 'Account Details' && (
                <>
                  <h2 className={styles.sectionTitle}>Account Information</h2>
                  
                  {/* Name Field */}
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Name</label>
                      <input
                        type="text"
                        className={styles.inputField}
                        placeholder="Your Name"
                      />
                    </div>
                  </div>
                  
                  {/* Email Field */}
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.fieldLabel}>Email</label>
                      <input
                        type="email"
                        className={styles.inputField}
                        placeholder="Your Email"
                      />
                    </div>
                  </div>
                  
                  {/* Update Password Button */}
                  <button className={styles.actionButton}>Update Password</button>
                  
                  {/* Order History Section */}
                  <h2 className={styles.sectionTitle}>Order History</h2>
                  
                  <div className="px-4">
                    <div className={styles.orderHistoryTable}>
                      <table className="w-full">
                        <thead>
                          <tr className={styles.tableHeader}>
                            <th>Order Number</th>
                            <th>Date</th>
                            <th>Items</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map(order => (
                            <tr key={order.id} className={styles.tableRow}>
                              <td className={styles.tableCell}>
                                <span className={styles.orderNumber}>{order.id}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.orderDate}>{order.date}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.orderItem}>{order.item}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <div className={styles.statusBadge}>{order.status}</div>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.viewDetails}>View Details</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* Wishlist Section */}
                  <h2 className={styles.sectionTitle}>Wishlist</h2>
                  
                  <div className={styles.emptyWishlist}>
                    <div 
                      className={styles.emptyWishlistIcon} 
                      style={{ backgroundColor: "#f9f9f9" }}
                    ></div>
                    <div className={styles.emptyWishlistContent}>
                      <h3 className={styles.emptyWishlistTitle}>Your wishlist is empty</h3>
                      <p className={styles.emptyWishlistText}>Save your favorite items to easily find them later.</p>
                    </div>
                    <button className={styles.actionButton}>Browse Products</button>
                  </div>
                  
                  {/* Address Book Section */}
                  <h2 className={styles.sectionTitle}>Address Book</h2>
                  
                  <div className={styles.addressContainer}>
                    <div className={styles.addressDetails}>
                      <span className={styles.addressLabel}>Home Address</span>
                      <span className={styles.addressValue}>123 Main Street, Anytown, 12345</span>
                    </div>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  
                  <button className={styles.actionButton}>Add New Address</button>
                  
                  {/* Payment Methods Section */}
                  <h2 className={styles.sectionTitle}>Payment Methods</h2>
                  
                  <div className={styles.paymentContainer}>
                    <div className={styles.paymentDetails}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={styles.creditCardIcon}>
                          <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="28" height="20" rx="3.5" fill="white"/>
                            <path d="M17.95 13.9H16.25V7.7L14.85 8.4L14.35 7.1L16.55 5.9H17.95V13.9ZM11.8496 13.9V12.5H8.44961V11.25L11.6996 5.9H13.2496V11.15H14.0996V12.5H13.2496V13.9H11.8496ZM9.89961 11.15H11.8496V7.7L9.89961 11.15Z" fill="#C4C4C4"/>
                          </svg>
                        </div>
                        <span className={styles.paymentLabel}>MasterCard ending in 1234</span>
                      </div>
                      <span className={styles.paymentExpiry}>Expires 12/25</span>
                    </div>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  
                  <button className={styles.actionButton}>Add New Payment Method</button>
                </>
              )}
              
              {/* Order History Tab Content */}
              {activeTab === 'Order History' && (
                <>
                  <h2 className={styles.sectionTitle}>Order History</h2>
                  
                  <div className="px-4">
                    <div className={styles.orderHistoryTable}>
                      <table className="w-full">
                        <thead>
                          <tr className={styles.tableHeader}>
                            <th>Order Number</th>
                            <th>Date</th>
                            <th>Items</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map(order => (
                            <tr key={order.id} className={styles.tableRow}>
                              <td className={styles.tableCell}>
                                <span className={styles.orderNumber}>{order.id}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.orderDate}>{order.date}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.orderItem}>{order.item}</span>
                              </td>
                              <td className={styles.tableCell}>
                                <div className={styles.statusBadge}>{order.status}</div>
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.viewDetails}>View Details</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              
              {/* Wishlist Tab Content */}
              {activeTab === 'Wishlist' && (
                <>
                  <h2 className={styles.sectionTitle}>Wishlist</h2>
                  
                  <div className={styles.emptyWishlist}>
                    <div 
                      className={styles.emptyWishlistIcon} 
                      style={{ backgroundColor: "#f9f9f9" }}
                    ></div>
                    <div className={styles.emptyWishlistContent}>
                      <h3 className={styles.emptyWishlistTitle}>Your wishlist is empty</h3>
                      <p className={styles.emptyWishlistText}>Save your favorite items to easily find them later.</p>
                    </div>
                    <button className={styles.actionButton}>Browse Products</button>
                  </div>
                </>
              )}
              
              {/* Address Book Tab Content */}
              {activeTab === 'Address Book' && (
                <>
                  <h2 className={styles.sectionTitle}>Address Book</h2>
                  
                  <div className={styles.addressContainer}>
                    <div className={styles.addressDetails}>
                      <span className={styles.addressLabel}>Home Address</span>
                      <span className={styles.addressValue}>123 Main Street, Anytown, 12345</span>
                    </div>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  
                  <button className={styles.actionButton}>Add New Address</button>
                </>
              )}
              
              {/* Payment Methods Tab Content */}
              {activeTab === 'Payment Methods' && (
                <>
                  <h2 className={styles.sectionTitle}>Payment Methods</h2>
                  
                  <div className={styles.paymentContainer}>
                    <div className={styles.paymentDetails}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={styles.creditCardIcon}>
                          <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="28" height="20" rx="3.5" fill="white"/>
                            <path d="M17.95 13.9H16.25V7.7L14.85 8.4L14.35 7.1L16.55 5.9H17.95V13.9ZM11.8496 13.9V12.5H8.44961V11.25L11.6996 5.9H13.2496V11.15H14.0996V12.5H13.2496V13.9H11.8496ZM9.89961 11.15H11.8496V7.7L9.89961 11.15Z" fill="#C4C4C4"/>
                          </svg>
                        </div>
                        <span className={styles.paymentLabel}>MasterCard ending in 1234</span>
                      </div>
                      <span className={styles.paymentExpiry}>Expires 12/25</span>
                    </div>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  
                  <button className={styles.actionButton}>Add New Payment Method</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 