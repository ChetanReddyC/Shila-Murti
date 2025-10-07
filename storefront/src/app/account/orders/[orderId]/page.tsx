'use client';

import React, { useEffect, useState } from 'react';
import Header from '../../../../components/Header';
import { useParams } from 'next/navigation';
import styles from './page.module.css';

type OrderStage = 'Placed' | 'Processed' | 'Shipped' | 'Delivered';

interface OrderItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  total: number;
  variant?: {
    id: string;
    title: string;
    product?: {
      id: string;
      title: string;
      thumbnail?: string;
    };
  };
}

interface Address {
  id: string;
  first_name?: string;
  last_name?: string;
  address_1: string;
  address_2?: string;
  city: string;
  province?: string;
  postal_code: string;
  country_code: string;
  phone?: string;
}

interface ShippingMethod {
  id: string;
  name: string;
  amount: number;
}

interface Payment {
  id: string;
  amount: number;
  provider_id: string;
  captured_at?: string;
  currency_code: string;
}

interface PaymentCollection {
  id: string;
  status: string;
  payments?: Payment[];
  amount: number;
}

interface Fulfillment {
  id: string;
  packed_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  labels?: Array<{ tracking_number?: string }>;
}

interface OrderData {
  id: string;
  display_id: string;
  created_at: string;
  status: string;
  fulfillment_status: string;
  payment_status?: string;
  currency_code: string;
  
  // Financial
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  
  // Relations
  items: OrderItem[];
  shipping_address?: Address;
  billing_address?: Address;
  shipping_methods?: ShippingMethod[];
  payment_collections?: PaymentCollection[];
  fulfillments?: Fulfillment[];
  
  metadata?: Record<string, any>;
}

// Helper functions
const formatCurrency = (amount: number, currencyCode: string = 'inr') => {
  // Don't divide - the backend values are already in the correct format
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const formatAddress = (addr?: Address) => {
  if (!addr) return '—';
  const parts = [
    addr.address_1,
    addr.address_2,
    addr.city,
    addr.province,
    addr.postal_code
  ].filter(Boolean);
  return parts.join(', ');
};

const getPaymentMethodName = (providerId?: string) => {
  if (!providerId) return 'Payment Method Not Available';
  
  const providerMap: Record<string, string> = {
    'pp_system_default': 'Manual Payment',
    'stripe': 'Credit Card',
    'razorpay': 'Razorpay',
    'cashfree': 'Cashfree Gateway'
  };
  
  return providerMap[providerId] || providerId;
};

const getActiveStageFromStatus = (status: string): OrderStage => {
  const statusMap: Record<string, OrderStage> = {
    'not_fulfilled': 'Placed',
    'partially_fulfilled': 'Processed',
    'fulfilled': 'Shipped',
    'shipped': 'Shipped',
    'delivered': 'Delivered'
  };
  
  return statusMap[status] || 'Placed';
};

export default function OrderDetailsPage() {
  const params = useParams();
  const orderId = params?.orderId as string;
  const [activeStage, setActiveStage] = useState<OrderStage>('Placed');
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Refs for timeline content sections
  const placedContentRef = React.useRef<HTMLDivElement>(null);
  const processedContentRef = React.useRef<HTMLDivElement>(null);
  const shippedContentRef = React.useRef<HTMLDivElement>(null);
  
  // Refs for timeline items (for scroll detection)
  const timelineItemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  
  // State for dynamic line heights
  const [lineHeights, setLineHeights] = React.useState({
    placed: 0,
    processed: 0,
    shipped: 0,
  });
  
  // State for tracking which timeline items are visible
  const [visibleItems, setVisibleItems] = React.useState<boolean[]>([false, false, false, false]);

  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        const customerId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null;
        if (!customerId || !orderId) {
          setLoading(false);
          return;
        }

        // Fetch the specific order directly instead of all orders
        const res = await fetch(`/api/account/orders/${orderId}?customer_id=${encodeURIComponent(customerId)}`);
        if (res.ok) {
          const json = await res.json();
          const order = json?.order;
          if (order) {
            console.log('[ORDER_DETAILS_DEBUG]', {
              orderId: order.id,
              hasItems: !!order.items,
              itemsCount: order.items?.length || 0,
              hasShippingAddress: !!order.shipping_address,
              hasFulfillments: !!order.fulfillments,
              hasPaymentCollections: !!order.payment_collections,
              hasShippingMethods: !!order.shipping_methods,
              keys: Object.keys(order)
            });
            setOrderData(order);
          } else {
            console.error('[ORDER_DETAILS_DEBUG] Order not found in response', { json });
          }
        } else {
          const errorText = await res.text().catch(() => '');
          console.error('[ORDER_DETAILS_DEBUG] Failed to fetch order', { status: res.status, error: errorText });
        }
      } catch (error) {
        console.error('Failed to fetch order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [orderId]);

  // Set active stage based on fulfillment status
  useEffect(() => {
    if (orderData?.fulfillment_status) {
      setActiveStage(getActiveStageFromStatus(orderData.fulfillment_status));
    }
  }, [orderData]);

  // Calculate line heights dynamically
  useEffect(() => {
    const calculateHeights = () => {
      if (placedContentRef.current && processedContentRef.current && shippedContentRef.current) {
        const placedHeight = placedContentRef.current.offsetHeight;
        const processedHeight = processedContentRef.current.offsetHeight;
        const shippedHeight = shippedContentRef.current.offsetHeight;
        
        setLineHeights({
          placed: placedHeight + 40, // Add spacing to reach next dot
          processed: processedHeight + 40,
          shipped: shippedHeight + 40,
        });
      }
    };

    // Calculate on mount and when data loads
    if (orderData) {
      setTimeout(calculateHeights, 100); // Small delay to ensure content is rendered
    }

    // Recalculate on window resize for responsiveness
    window.addEventListener('resize', calculateHeights);
    return () => window.removeEventListener('resize', calculateHeights);
  }, [orderData]);

  // Intersection Observer for scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = timelineItemRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index !== -1 && entry.isIntersecting) {
            setVisibleItems((prev) => {
              const newVisible = [...prev];
              newVisible[index] = true;
              return newVisible;
            });
          }
        });
      },
      {
        threshold: 0.2, // Trigger when 20% of the element is visible
        rootMargin: '0px 0px -100px 0px', // Start animation slightly before element is fully in view
      }
    );

    // Observe all timeline items
    timelineItemRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      timelineItemRefs.current.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, [orderData]); // Re-run when order data changes

  const stages: { name: OrderStage; icon: string }[] = [
    { name: 'Placed', icon: 'check' },
    { name: 'Processed', icon: 'precision_manufacturing' },
    { name: 'Shipped', icon: 'local_shipping' },
    { name: 'Delivered', icon: 'package' },
  ];

  const getTimelineDate = (stage: 'placed' | 'processed' | 'shipped' | 'delivered'): string | null => {
    if (!orderData) return null;
    const ful = orderData.fulfillments?.[0];
    
    switch(stage) {
      case 'placed':
        return orderData.created_at;
      case 'processed':
        return ful?.packed_at || null;
      case 'shipped':
        return ful?.shipped_at || null;
      case 'delivered':
        return ful?.delivered_at || null;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.centerContent}>
          <p className={styles.loadingText}>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.centerContent}>
          <p className={styles.loadingText}>Order not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Header />
      
      <div className={styles.mainWrapper}>
        <div className={styles.contentWrapper}>
          {/* Order Header */}
          <div className={styles.orderHeader}>
            <div>
              <p className={styles.orderTitle}>Order Details</p>
              <p className={styles.orderNumber}>
                Order #{orderData.display_id || orderData.id}
              </p>
              <p className={styles.orderDate}>
                Placed on {formatDate(orderData.created_at)}
              </p>
            </div>
          </div>

          <div className={styles.spacer} />

          {/* Progress Tracker */}
          <div className={styles.progressTracker}>
            {stages.map((stage, index) => (
              <React.Fragment key={stage.name}>
                <div
                  className={`${styles.stageItem} ${
                    activeStage === stage.name ? styles.stageItemActive : styles.stageItemInactive
                  }`}
                  onClick={() => setActiveStage(stage.name)}
                >
                  <div
                    className={`${styles.stageIcon} ${
                      activeStage === stage.name
                        ? styles.stageIconActive
                        : styles.stageIconInactive
                    }`}
                  >
                    <span className={`material-symbols-outlined ${styles.materialIcon}`}>{stage.icon}</span>
                  </div>
                  <p
                    className={`${styles.stageName} ${
                      activeStage === stage.name
                        ? styles.stageNameActive
                        : styles.stageNameInactive
                    }`}
                  >
                    {stage.name}
                  </p>
                </div>
                {index < stages.length - 1 && (
                  <div className={styles.progressLine}></div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Stage Details */}
          <div className={styles.stageDetails}>
            <div className={styles.stagesContainer}>
              {/* Order Placed */}
              <div 
                className={`${styles.timelineItem} ${visibleItems[0] ? styles.visible : ''}`}
                ref={(el) => (timelineItemRefs.current[0] = el)}
              >
                <div className={styles.timelineIcon}>
                  <div className={styles.timelineDot}>
                    <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                  </div>
                  <div 
                    className={styles.timelineLine} 
                    style={{ height: lineHeights.placed ? `${lineHeights.placed}px` : '290px' }}
                  />
                </div>
                <div className={styles.timelineContent} ref={placedContentRef}>
                  <p className={styles.sectionTitle}>Order Placed</p>
                  {getTimelineDate('placed') && (
                    <p className={styles.sectionTime}>
                      {formatDate(getTimelineDate('placed')!)} at {formatTime(getTimelineDate('placed')!)}
                    </p>
                  )}
                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <p className={styles.itemsTitle}>Items:</p>
                      {orderData.items && orderData.items.length > 0 ? (
                        orderData.items.map((item) => (
                          <div key={item.id} className={styles.itemRow}>
                            <img
                              src={item.thumbnail || item.variant?.product?.thumbnail || '/placeholder-product.png'}
                              alt={item.title}
                              className={styles.itemImage}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/placeholder-product.png';
                              }}
                            />
                            <div className={styles.itemDetails}>
                              <p className={styles.itemTitle}>{item.title}</p>
                              <p className={styles.itemMeta}>
                                Quantity: {item.quantity} | Price: {formatCurrency(item.unit_price || 0, orderData.currency_code || 'inr')}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className={styles.itemMeta}>No items found</p>
                      )}
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.summaryContainer}>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Subtotal</p>
                          <p className={styles.summaryValue}>{formatCurrency(orderData.subtotal || 0, orderData.currency_code || 'inr')}</p>
                        </div>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Shipping</p>
                          <p className={styles.summaryValue}>{formatCurrency(orderData.shipping_total || 0, orderData.currency_code || 'inr')}</p>
                        </div>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Taxes</p>
                          <p className={styles.summaryValue}>{formatCurrency(orderData.tax_total || 0, orderData.currency_code || 'inr')}</p>
                        </div>
                        <div className={styles.totalRow}>
                          <p className={styles.totalLabel}>Total</p>
                          <p className={styles.totalValue}>{formatCurrency(orderData.total || 0, orderData.currency_code || 'inr')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Processed */}
              <div 
                className={`${styles.timelineItem} ${visibleItems[1] ? styles.visible : ''}`}
                ref={(el) => (timelineItemRefs.current[1] = el)}
              >
                <div className={styles.timelineIcon}>
                  <div className={styles.timelineDot}>
                    <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                  </div>
                  <div 
                    className={styles.timelineLine} 
                    style={{ height: lineHeights.processed ? `${lineHeights.processed}px` : '210px' }}
                  />
                </div>
                <div className={styles.timelineContent} ref={processedContentRef}>
                  <p className={styles.sectionTitle}>Order Processed</p>
                  {getTimelineDate('processed') ? (
                    <p className={styles.sectionTime}>
                      {formatDate(getTimelineDate('processed')!)} at {formatTime(getTimelineDate('processed')!)}
                    </p>
                  ) : (
                    <p className={styles.sectionTime}>Processing...</p>
                  )}
                  <div className={styles.card}>
                    <div className={styles.cardBody}>
                      <div className={styles.detailsContainer}>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Shipping Address</p>
                          <p className={styles.detailValue}>{formatAddress(orderData.shipping_address)}</p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Shipping Method</p>
                          <p className={styles.detailValue}>
                            {orderData.shipping_methods?.[0]?.name || 'Standard Shipping'}
                          </p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Billing Address</p>
                          <p className={styles.detailValue}>
                            {formatAddress(orderData.billing_address || orderData.shipping_address)}
                          </p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Payment Method</p>
                          <p className={styles.detailValue}>
                            {getPaymentMethodName(orderData.payment_collections?.[0]?.payments?.[0]?.provider_id)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Shipped */}
              <div 
                className={`${styles.timelineItem} ${visibleItems[2] ? styles.visible : ''}`}
                ref={(el) => (timelineItemRefs.current[2] = el)}
              >
                <div className={styles.timelineIcon}>
                  <div className={styles.timelineDot}>
                    <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                  </div>
                  <div 
                    className={styles.timelineLine} 
                    style={{ height: lineHeights.shipped ? `${lineHeights.shipped}px` : '160px' }}
                  />
                </div>
                <div className={styles.timelineContent} ref={shippedContentRef}>
                  <p className={styles.sectionTitle}>Order Shipped</p>
                  {getTimelineDate('shipped') ? (
                    <p className={styles.sectionTime}>
                      {formatDate(getTimelineDate('shipped')!)} at {formatTime(getTimelineDate('shipped')!)}
                    </p>
                  ) : (
                    <p className={styles.sectionTime}>Awaiting shipment...</p>
                  )}
                  <div className={styles.card}>
                    <div className={styles.cardBody}>
                      {orderData.fulfillments?.[0]?.labels?.[0]?.tracking_number ? (
                        <>
                          <p className={styles.trackingTitle}>Tracking Information:</p>
                          <p className={styles.trackingNumber}>
                            Tracking Number: {orderData.fulfillments[0].labels[0].tracking_number}
                          </p>
                          <a className={styles.trackingLink} href="#" onClick={(e) => e.preventDefault()}>
                            Track your order on the carrier&apos;s website
                          </a>
                        </>
                      ) : (
                        <>
                          <p className={styles.trackingTitle}>Tracking Information:</p>
                          <p className={styles.trackingNumber}>Tracking information not available yet</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Delivered */}
              <div 
                className={`${styles.timelineItem} ${visibleItems[3] ? styles.visible : ''}`}
                ref={(el) => (timelineItemRefs.current[3] = el)}
              >
                <div className={styles.timelineIcon}>
                  <div className={styles.timelineDot}>
                    <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>local_shipping</span>
                  </div>
                </div>
                <div className={styles.timelineContentNoBottom}>
                  <p className={styles.sectionTitle}>Delivered</p>
                  {getTimelineDate('delivered') ? (
                    <p className={styles.sectionTimeBase}>
                      Delivered on {formatDate(getTimelineDate('delivered')!)}
                    </p>
                  ) : (
                    <p className={styles.sectionTimeBase}>
                      Estimated Delivery: {(() => {
                        const shippedDate = getTimelineDate('shipped');
                        if (shippedDate) {
                          const estimated = new Date(shippedDate);
                          estimated.setDate(estimated.getDate() + 3); // Add 3 days for estimated delivery
                          return formatDate(estimated.toISOString());
                        }
                        return 'To be determined';
                      })()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
