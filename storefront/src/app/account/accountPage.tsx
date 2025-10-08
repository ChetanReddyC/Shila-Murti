'use client';

import React, { useEffect, useState } from 'react';
import Header from '../../components/Header';
import styles from './accountPage.module.css';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSession, signIn } from 'next-auth/react';
const PasskeySection = dynamic(() => import('./PasskeySection'), { ssr: false })

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState('Account Details');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [orders, setOrders] = useState<Array<{ id: string; orderId: string; date: string; item: string; status: string }>>([]);
  const [addressText, setAddressText] = useState<string>('');
  const [addresses, setAddresses] = useState<Array<{ label: string; value: string }>>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data: session } = useSession();
  const [ensureInFlight, setEnsureInFlight] = useState(false);
  
  const [cursorCache, setCursorCache] = useState<Map<number, string | null>>(new Map([[1, null]]));
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);

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
  }, [customerId])

  const fetchOrders = async (page: number, search: string = '') => {
    if (!customerId) return
    
    setOrdersLoading(true)
    try {
      const cursor = cursorCache.get(page)
      const params = new URLSearchParams({ customer_id: customerId, limit: '6' })
      if (cursor) params.set('cursor', cursor)
      if (search) params.set('search', search)
      
      const res = await fetch(`/api/account/orders?${params.toString()}`)
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
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        setOrders(mapped)
        setHasMore(json.hasMore || false)
        
        if (json.nextCursor && json.hasMore) {
          setCursorCache(prev => {
            const newCache = new Map(prev)
            newCache.set(page + 1, json.nextCursor)
            return newCache
          })
        }
      }
    } catch {}
    setOrdersLoading(false)
  }

  useEffect(() => {
    if (customerId) {
      fetchOrders(1, searchQuery)
    }
  }, [customerId])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchOrders(page, searchQuery)
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
    setCursorCache(new Map([[1, null]]))
    setHasMore(false)
    fetchOrders(1, query)
  }

  const renderPagination = () => {
    const pages: number[] = []
    const maxVisiblePages = 5
    
    for (let i = 1; i <= Math.min(currentPage + (hasMore ? 1 : 0), currentPage + 3); i++) {
      if (cursorCache.has(i) || i === currentPage) {
        pages.push(i)
      }
    }
    
    return (
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        alignItems: 'center', 
        justifyContent: 'center', 
        marginTop: '24px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1 || ordersLoading}
          style={{
            padding: '4px 12px',
            border: '1px solid #E5E7EB',
            borderRadius: '10px',
            background: '#F2F2F2',
            cursor: currentPage === 1 || ordersLoading ? 'not-allowed' : 'pointer',
            opacity: currentPage === 1 ? 0.5 : 1,
            fontFamily: '"Public Sans", sans-serif',
            fontWeight: 500,
            fontSize: '14px',
            lineHeight: '1.5em',
            color: '#000000',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: 'scale(1)'
          }}
          onMouseEnter={(e) => !ordersLoading && currentPage !== 1 && (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          ← Previous
        </button>
        
        <div style={{ 
          display: 'inline-block',
          position: 'relative',
          width: `${pages.length * 60 + (pages.length - 1) * 12}px`,
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'visible'
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            width: '100%'
          }}>
            {pages.map((page, index) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                disabled={ordersLoading}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '10px',
                  background: page === currentPage ? '#000' : '#F2F2F2',
                  color: page === currentPage ? '#fff' : '#000000',
                  cursor: ordersLoading ? 'not-allowed' : 'pointer',
                  fontFamily: '"Public Sans", sans-serif',
                  fontWeight: 500,
                  fontSize: '14px',
                  lineHeight: '1.5em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '32px',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: 'scale(1)',
                  animation: `fadeInSlide 0.45s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.06}s both`
                }}
                onMouseEnter={(e) => !ordersLoading && (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
        
        {hasMore && (
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={ordersLoading}
            style={{
              padding: '4px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: '10px',
              background: '#F2F2F2',
              cursor: ordersLoading ? 'not-allowed' : 'pointer',
              fontFamily: '"Public Sans", sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              lineHeight: '1.5em',
              color: '#000000',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: 'scale(1)',
              animation: 'fadeInSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1) both'
            }}
            onMouseEnter={(e) => !ordersLoading && (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Next →
          </button>
        )}
        
        <span style={{ 
          marginLeft: '12px', 
          color: '#757575', 
          fontSize: '14px', 
          fontFamily: '"Public Sans", sans-serif', 
          fontWeight: 400,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          Page {currentPage}
        </span>
        
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeInSlide {
              from {
                opacity: 0;
                transform: translateX(-10px) scale(0.9);
              }
              to {
                opacity: 1;
                transform: translateX(0) scale(1);
              }
            }
            @keyframes fadeInTableRow {
              from {
                opacity: 0;
                transform: translateY(-5px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes shimmer {
              0% {
                background-position: 200% 0;
              }
              100% {
                background-position: -200% 0;
              }
            }
          `
        }} />
      </div>
    )
  }

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
                  
                  {/* Order History Section */}
                  <h2 className={styles.sectionTitle} style={{ marginBottom: '6px' }}>Order History</h2>
                  
                  <div style={{ padding: '0 16px 8px 16px' }}>
                    <input
                      type="text"
                      placeholder="Search orders by number or status..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      style={{
                        width: 'calc(100% - 32px)',
                        margin: '0 16px',
                        padding: '12px 16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: '"Public Sans", sans-serif',
                        color: '#141414',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        transition: 'border-color 0.2s ease'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#000'}
                      onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                    />
                    <style dangerouslySetInnerHTML={{
                      __html: `
                        input::placeholder {
                          color: #9CA3AF;
                          opacity: 1;
                        }
                      `
                    }} />
                  </div>
                  
                  <div className="px-4">
                    <div className={styles.orderHistoryTable}>
                      <table className="w-full" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr className={styles.tableHeader}>
                            <th style={{ width: '15%' }}>Order Number</th>
                            <th style={{ width: '15%' }}>Date</th>
                            <th style={{ width: '35%' }}>Items</th>
                            <th style={{ width: '15%' }}>Status</th>
                            <th style={{ width: '20%' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody style={{ position: 'relative', display: 'table-row-group' }}>
                          {ordersLoading ? (
                            <>
                              {Array.from({ length: 6 }).map((_, idx) => (
                                <tr key={`skeleton-${idx}`} style={{ height: '60px', backgroundColor: '#fff' }}>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '70%',
                                      maxWidth: '90px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '65%',
                                      maxWidth: '85px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.1s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '60%',
                                      maxWidth: '180px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.2s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '70%',
                                      maxWidth: '85px',
                                      height: '28px',
                                      borderRadius: '10px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.3s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '60%',
                                      maxWidth: '95px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.4s'
                                    }} />
                                  </td>
                                </tr>
                              ))}
                            </>
                          ) : !ordersLoading && orders.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', padding: '80px 0', height: '360px' }}>
                                <div style={{ fontSize: '14px', color: '#666' }}>No orders yet</div>
                              </td>
                            </tr>
                          ) : (
                            <>
                              {orders.map((order, idx) => (
                                <tr 
                                  key={order.id} 
                                  className={styles.tableRow} 
                                  style={{ 
                                    height: '60px',
                                    animation: `fadeInTableRow 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${idx * 0.05}s both`
                                  }}
                                >
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
                              {Array.from({ length: Math.max(0, 6 - orders.length) }).map((_, idx) => (
                                <tr key={`empty-${idx}`} style={{ height: '60px' }}>
                                  <td colSpan={5} style={{ padding: 0, border: 'none' }}>&nbsp;</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination()}
                  </div>
                  
                  {/* Wishlist Section */}
                  <h2 className={styles.sectionTitle}>Wishlist</h2>
                  
                  <div className={styles.emptyWishlist}>
                    <img 
                      src="/theme_images/whishlistempty.png" 
                      alt="Empty wishlist"
                      className={styles.emptyWishlistIcon}
                    />
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
                  <h2 className={styles.sectionTitle} style={{ marginBottom: '12px' }}>Order History</h2>
                  
                  <div style={{ padding: '0 16px 24px 16px' }}>
                    <input
                      type="text"
                      placeholder="Search orders by number or status..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      style={{
                        width: 'calc(100% - 32px)',
                        margin: '0 16px',
                        padding: '12px 16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: '"Public Sans", sans-serif',
                        color: '#141414',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        transition: 'border-color 0.2s ease'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#000'}
                      onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                    />
                  </div>
                  
                  <div className="px-4">
                    <div className={styles.orderHistoryTable}>
                      <table className="w-full" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr className={styles.tableHeader}>
                            <th style={{ width: '15%' }}>Order Number</th>
                            <th style={{ width: '15%' }}>Date</th>
                            <th style={{ width: '35%' }}>Items</th>
                            <th style={{ width: '15%' }}>Status</th>
                            <th style={{ width: '20%' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody style={{ position: 'relative', display: 'table-row-group' }}>
                          {ordersLoading ? (
                            <>
                              {Array.from({ length: 6 }).map((_, idx) => (
                                <tr key={`skeleton-${idx}`} style={{ height: '60px', backgroundColor: '#fff' }}>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '70%',
                                      maxWidth: '90px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '65%',
                                      maxWidth: '85px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.1s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '60%',
                                      maxWidth: '180px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.2s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '70%',
                                      maxWidth: '85px',
                                      height: '28px',
                                      borderRadius: '10px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.3s'
                                    }} />
                                  </td>
                                  <td className={styles.tableCell}>
                                    <div style={{
                                      width: '60%',
                                      maxWidth: '95px',
                                      height: '20px',
                                      borderRadius: '6px',
                                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite',
                                      animationDelay: '0.4s'
                                    }} />
                                  </td>
                                </tr>
                              ))}
                            </>
                          ) : !ordersLoading && orders.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', padding: '80px 0', height: '360px' }}>
                                <div style={{ fontSize: '14px', color: '#666' }}>No orders yet</div>
                              </td>
                            </tr>
                          ) : (
                            <>
                              {orders.map((order, idx) => (
                                <tr 
                                  key={order.id} 
                                  className={styles.tableRow} 
                                  style={{ 
                                    height: '60px',
                                    animation: `fadeInTableRow 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${idx * 0.05}s both`
                                  }}
                                >
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
                              {Array.from({ length: Math.max(0, 6 - orders.length) }).map((_, idx) => (
                                <tr key={`empty-${idx}`} style={{ height: '60px' }}>
                                  <td colSpan={5} style={{ padding: 0, border: 'none' }}>&nbsp;</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination()}
                  </div>
                </>
              )}
              
              {/* Wishlist Tab Content */}
              {activeTab === 'Wishlist' && (
                <>
                  <h2 className={styles.sectionTitle}>Wishlist</h2>
                  
                  <div className={styles.emptyWishlist}>
                    <img 
                      src="/theme_images/whishlistempty.png" 
                      alt="Empty wishlist"
                      className={styles.emptyWishlistIcon}
                    />
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