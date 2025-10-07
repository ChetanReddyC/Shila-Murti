'use client';

import React, { useEffect, useState } from 'react';
import Header from '../../components/Header';
import styles from './accountPage.module.css';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSession, signIn } from 'next-auth/react';
const PasskeySection = dynamic(() => import('./PasskeySection'), { ssr: false })

export default function AccountPage() {
  // State to keep track of active tab
  const [activeTab, setActiveTab] = useState('Account Details');
  // Real data state (UI not changed; just wiring values)
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [orders, setOrders] = useState<Array<{ id: string; orderId: string; date: string; item: string; status: string }>>([]);
  const [addressText, setAddressText] = useState<string>('');
  const [addresses, setAddresses] = useState<Array<{ label: string; value: string }>>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data: session } = useSession();
  const [ensureInFlight, setEnsureInFlight] = useState(false);

  // Navigation items
  const navigationItems = [
    'Account Details',
    'Order History',
    'Wishlist',
    'Address Book',
    'Payment Methods',
    'Security'
  ];

  useEffect(() => {
    try {
      const cid = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null
      const normalized = cid && cid !== 'undefined' && cid !== 'null' ? cid : null
      if (normalized) {
        setCustomerId(normalized)
      } else if (cid && (cid === 'undefined' || cid === 'null')) {
        sessionStorage.removeItem('customerId')
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (customerId || ensureInFlight) return
    const originalEmail = session?.user?.originalEmail as string | undefined
    const originalPhone = session?.user?.originalPhone as string | undefined
    const identifier = originalPhone || originalEmail
    if (!identifier) return

    setEnsureInFlight(true)
    ;(async () => {
      try {
        const payload: Record<string, any> = {}
        if (originalPhone) payload.phone = originalPhone
        if (originalEmail) payload.email = originalEmail
        const res = await fetch('/api/account/customer/ensure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const json = await res.json()
          const ensuredId = json?.customerId
          if (ensuredId) {
            if (typeof window !== 'undefined') sessionStorage.setItem('customerId', ensuredId)
            setCustomerId(ensuredId)
            try {
              await signIn('session', { identifier, customerId: ensuredId, redirect: false })
            } catch {}
          }
        }
      } catch {}
      setEnsureInFlight(false)
    })()
  }, [customerId, ensureInFlight, session?.user?.originalEmail, session?.user?.originalPhone])

  useEffect(() => {
    if (!customerId) return
    // Load profile
    ;(async () => {
      try {
        const res = await fetch(`/api/account/profile?customer_id=${encodeURIComponent(customerId)}`)
        if (res.ok) {
          const data = await res.json()
          const c = data?.customer || data || {}
          const fn = (c.first_name || '').toString().trim()
          const ln = (c.last_name || '').toString().trim()
          const nm = [fn, ln].filter(Boolean).join(' ').trim()
          if (nm) setName(nm)
          if (c.email) setEmail(String(c.email))
          if (!customerId && c.id) setCustomerId(String(c.id))
          const addrList: any[] = Array.isArray(c.addresses) ? c.addresses : []
          if (addrList.length > 0) {
            const primary = addrList[0]
            const line = [primary.address_1, primary.city, primary.postal_code].filter(Boolean).join(', ')
            if (line) setAddressText(line)
            const mappedAddresses = addrList.map((addr: any, idx: number) => {
              const label = addr.address_name || (idx === 0 ? 'Home Address' : 'Address')
              const value = [addr.address_1, addr.city, addr.postal_code].filter(Boolean).join(', ')
              return { label, value }
            })
            setAddresses(mappedAddresses)
          }
        }
      } catch {}
    })()

    // Load addresses (fallback to ensure latest data)
    ;(async () => {
      try {
        const res = await fetch(`/api/account/addresses?customer_id=${encodeURIComponent(customerId)}`)
        if (res.ok) {
          const json = await res.json()
          const list: any[] = Array.isArray(json?.addresses) ? json.addresses : []
          if (list.length > 0) {
            const a = list[0]
            const line = [a.address_1, a.city, a.postal_code].filter(Boolean).join(', ')
            if (line) setAddressText(line)
            const mappedAddresses = list.map((addr: any) => {
              const label = addr.address_name || 'Address'
              const value = [addr.address_1, addr.city, addr.postal_code].filter(Boolean).join(', ')
              return { label, value }
            })
            setAddresses(mappedAddresses)
          }
        }
      } catch {}
    })()
    // Load orders
    ;(async () => {
      try {
        const res = await fetch(`/api/account/orders?customer_id=${encodeURIComponent(customerId)}`)
        if (res.ok) {
          const json = await res.json()
          const list: any[] = Array.isArray(json?.orders) ? json.orders : []
          const mapped = list.map((o: any) => {
            const created = o.created_at || o.createdAt
            const date = created ? new Date(created).toISOString().slice(0, 10) : ''
            const items = Array.isArray(o.items) ? o.items : []
            const firstItem = items[0]?.title || (items[0]?.variant?.title) || 'Order items'
            const id = (o.display_id ? `#${o.display_id}` : (o.id || '')) as string
            const orderId = o.id as string
            const status = (o.status || o.fulfillment_status || 'Processing') as string
            return { id, orderId, date, item: firstItem, status }
          })
          setOrders(mapped)
        }
      } catch {}
    })()
  }, [customerId])

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
                        value={name}
                        onChange={(e) => setName(e.target.value)}
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
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                                <Link href={`/account/orders/${order.orderId}`} className={styles.viewDetails}>View Details</Link>
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
                      <span className={styles.addressValue}>{addressText || '—'}</span>
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
                                <Link href={`/account/orders/${order.orderId}`} className={styles.viewDetails}>View Details</Link>
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
                  {(addresses.length ? addresses : [{ label: 'Home Address', value: addressText || '—' }]).map((addr, idx) => (
                    <div key={`${addr.label}-${idx}`} className={styles.addressContainer}>
                      <div className={styles.addressDetails}>
                        <span className={styles.addressLabel}>{addr.label}</span>
                        <span className={styles.addressValue}>{addr.value || '—'}</span>
                      </div>
                      <button className={styles.editButton}>Edit</button>
                    </div>
                  ))}
                  
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

              {/* Security Tab Content */}
              {activeTab === 'Security' && (
                <>
                  <h2 className={styles.sectionTitle}>Security</h2>
                  <PasskeySection />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 