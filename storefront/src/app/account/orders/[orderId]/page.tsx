'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import SessionGuard from '@/components/SessionGuard';
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

interface Customer {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

interface OrderData {
  id: string;
  display_id: string;
  created_at: string;
  status: string;
  fulfillment_status: string;
  payment_status?: string;
  currency_code: string;
  email?: string;
  
  // Financial
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  discount_total?: number;
  
  // Relations
  items: OrderItem[];
  shipping_address?: Address;
  billing_address?: Address;
  shipping_methods?: ShippingMethod[];
  payment_collections?: PaymentCollection[];
  fulfillments?: Fulfillment[];
  customer?: Customer;
  
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
    'pp_system_default': 'Cashfree Gateway',
    'stripe': 'Credit Card',
    'razorpay': 'Razorpay',
    'cashfree': 'Cashfree Gateway'
  };
  
  return providerMap[providerId] || providerId;
};

const getPaymentStatusBadge = (paymentStatus?: string): { label: string; color: string } => {
  const normalizedStatus = paymentStatus?.toLowerCase();
  
  switch (normalizedStatus) {
    case 'captured':
    case 'paid':
    case 'completed':
      return { label: 'Paid', color: '#10b981' }; // green
    case 'awaiting':
    case 'pending':
    case 'not_paid':
      return { label: 'Awaiting', color: '#f59e0b' }; // yellow
    case 'refunded':
    case 'partially_refunded':
      return { label: 'Refunded', color: '#ef4444' }; // red
    case 'canceled':
    case 'cancelled':
      return { label: 'Cancelled', color: '#6b7280' }; // gray
    default:
      return { label: 'Unknown', color: '#6b7280' }; // gray
  }
};

function OrderDetailsPageContent() {
  const params = useParams();
  const orderId = params?.orderId as string;
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  
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
        const res = await fetch(`/api/account/orders/${orderId}`);
        if (res.ok) {
          const json = await res.json();
          const order = json?.order;
          if (order) {
            setOrderData(order);
            
            // Auto-check refund status if order cancelled and has pending refund
            if (order.status === 'canceled' && 
                order.metadata?.refund_id && 
                order.metadata?.refund_status !== 'SUCCESS') {
              console.log('[ORDER_DETAILS] Auto-checking refund status...');
              
              // Check refund status in background
              fetch(`/api/account/orders/${orderId}/refund-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              })
              .then(res => res.json())
              .then(result => {
                if (result.order) {
                  console.log('[ORDER_DETAILS] Refund status updated:', result.refund?.status);
                  setOrderData(result.order);
                }
              })
              .catch(err => console.error('[ORDER_DETAILS] Refund check failed:', err));
            }
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

  // Check if a stage is complete based on whether it has a timestamp
  const isStageComplete = (stage: 'placed' | 'processed' | 'shipped' | 'delivered'): boolean => {
    if (stage === 'placed') return true; // Placed is always complete
    return getTimelineDate(stage) !== null;
  };

  // Check if order can be cancelled
  const canCancelOrder = (order: OrderData | null): boolean => {
    if (!order) return false;
    if (order.status === 'canceled') return false;
    if (order.fulfillment_status === 'delivered') return false;
    if (order.fulfillment_status === 'shipped') return false;
    if (order.payment_status === 'captured' && order.fulfillment_status === 'fulfilled') return false;
    return true;
  };

  // Handle cancel order
  const handleCancelOrder = async () => {
    if (!orderId) return;
    
    const customerId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null;
    if (!customerId) {
      setCancelError('Unable to cancel order: Customer not found');
      return;
    }
    
    setIsCancelling(true);
    setCancelError(null);
    setShowCancelModal(false);
    
    try {
      const response = await fetch(`/api/account/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.reason || 'Failed to cancel order');
      }

      const result = await response.json();
      
      if (result.order) {
        setOrderData(result.order);
        setCancelSuccess(true);
        
        setTimeout(() => {
          setCancelSuccess(false);
        }, 5000);
      }
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      setCancelError(error.message || 'Failed to cancel order. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Download invoice handler
  const downloadInvoice = async () => {
    if (!orderId) return;
    
    const customerId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null;
    if (!customerId) {
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
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `invoice-${orderData?.display_id || orderId}.pdf`,
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
      a.download = `invoice-${orderData?.display_id || orderId}.pdf`;
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

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContent}>
          <p className={styles.loadingText}>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContent}>
          <p className={styles.loadingText}>Order not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ paddingTop: '100px' }}>
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
            {stages.map((stage, index) => {
              const stageKey = stage.name.toLowerCase() as 'placed' | 'processed' | 'shipped' | 'delivered';
              const isComplete = isStageComplete(stageKey);
              
              return (
                <React.Fragment key={stage.name}>
                  <div className={styles.stageItem}>
                    <div
                      className={`${styles.stageIcon} ${
                        isComplete
                          ? styles.stageIconActive
                          : styles.stageIconInactive
                      }`}
                    >
                      <span className={`material-symbols-outlined ${styles.materialIcon}`}>{stage.icon}</span>
                    </div>
                    <p
                      className={`${styles.stageName} ${
                        isComplete
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
              );
            })}
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
                        <div className={orderData.items.length > 1 ? styles.itemsGrid : styles.itemsSingle}>
                          {orderData.items.map((item) => (
                            <div key={item.id} className={orderData.items.length > 1 ? styles.itemRow : styles.itemRowSingle}>
                              <img
                                src={item.thumbnail || item.variant?.product?.thumbnail || '/placeholder-product.png'}
                                alt={item.title}
                                className={orderData.items.length > 1 ? styles.itemImage : styles.itemImageSingle}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = '/placeholder-product.png';
                                }}
                              />
                              <div className={styles.itemDetails}>
                                <p className={styles.itemTitle}>{item.title}</p>
                                <div className={styles.itemMeta}>
                                  <span>Quantity: {item.quantity}</span>
                                  <span>{formatCurrency(item.unit_price || 0, orderData.currency_code || 'inr')}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
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
                        {orderData.discount_total > 0 && (
                          <div className={styles.summaryRow}>
                            <p className={styles.summaryLabel}>Discount</p>
                            <p className={styles.summaryValue} style={{ color: '#10b981' }}>-{formatCurrency(orderData.discount_total, orderData.currency_code || 'inr')}</p>
                          </div>
                        )}
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
                    {isStageComplete('processed') ? (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                    ) : (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>schedule</span>
                    )}
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
                        {orderData.shipping_address && (orderData.shipping_address.first_name || orderData.shipping_address.last_name) && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Customer Name</p>
                            <p className={styles.detailValue}>
                              {[orderData.shipping_address.first_name, orderData.shipping_address.last_name].filter(Boolean).join(' ')}
                            </p>
                          </div>
                        )}
                        {(orderData.customer?.email || orderData.email) && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Email</p>
                            <p className={styles.detailValue}>{orderData.customer?.email || orderData.email}</p>
                          </div>
                        )}
                        {(orderData.customer?.phone || orderData.shipping_address?.phone) && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Phone</p>
                            <p className={styles.detailValue}>{orderData.customer?.phone || orderData.shipping_address?.phone}</p>
                          </div>
                        )}
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
                          <p className={styles.detailLabel}>Payment Method</p>
                          <p className={styles.detailValue}>
                            {getPaymentMethodName(orderData.payment_collections?.[0]?.payments?.[0]?.provider_id)}
                          </p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Payment Status</p>
                          <p className={styles.detailValue}>
                            {getPaymentStatusBadge(orderData.payment_status).label}
                          </p>
                        </div>
                        {orderData.payment_collections?.[0]?.payments?.[0]?.captured_at && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Payment Captured</p>
                            <p className={styles.detailValue}>
                              {formatDate(orderData.payment_collections[0].payments[0].captured_at)}
                            </p>
                          </div>
                        )}
                        {/* Refund Status Display - Only show if refund actually initiated with Cashfree */}
                        {orderData.status === 'canceled' && orderData.metadata?.cf_refund_id && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Refund Status</p>
                            <p className={styles.detailValue} style={{ 
                              color: orderData.metadata.refund_status?.toUpperCase() === 'SUCCESS' ? '#10b981' : 
                                     ['PENDING', 'PROCESSING'].includes(orderData.metadata.refund_status?.toUpperCase() || '') ? '#f59e0b' : 
                                     '#6b7280' 
                            }}>
                              {orderData.metadata.refund_status?.toUpperCase() === 'SUCCESS' ? '✓ Refund Processed' :
                               ['PENDING', 'PROCESSING'].includes(orderData.metadata.refund_status?.toUpperCase() || '') ? 'Refund Processing...' :
                               orderData.metadata.refund_status ? String(orderData.metadata.refund_status) : 'Refund Initiated'}
                            </p>
                          </div>
                        )}
                        {orderData.status === 'canceled' && orderData.metadata?.refund_amount && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Refund Amount</p>
                            <p className={styles.detailValue}>
                              {formatCurrency(orderData.metadata.refund_amount as number, orderData.currency_code || 'inr')}
                            </p>
                          </div>
                        )}
                        {orderData.status === 'canceled' && orderData.metadata?.refund_initiated_at && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Refund Initiated</p>
                            <p className={styles.detailValue}>
                              {formatDate(orderData.metadata.refund_initiated_at as string)}
                            </p>
                          </div>
                        )}
                        {orderData.status === 'canceled' && orderData.metadata?.refund_error && (
                          <div className={styles.detailRow}>
                            <p className={styles.detailLabel}>Refund Note</p>
                            <p className={styles.detailValue} style={{ color: '#ef4444' }}>
                              {orderData.metadata.refund_error as string}
                            </p>
                          </div>
                        )}
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
                    {isStageComplete('shipped') ? (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                    ) : (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>schedule</span>
                    )}
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
                    {isStageComplete('delivered') ? (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>check</span>
                    ) : (
                      <span className={`material-symbols-outlined ${styles.timelineIconSmall}`}>schedule</span>
                    )}
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

      {/* Fixed Action Buttons - Bottom Right */}
      <div className={styles.fixedButtonsContainer}>
        {canCancelOrder(orderData) && (
          <button
            className={styles.cancelButtonFixed}
            onClick={() => setShowCancelModal(true)}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <>
                <span className="material-symbols-outlined">hourglass_empty</span>
                Cancelling...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">cancel</span>
                Cancel Order
              </>
            )}
          </button>
        )}
        

        <button
          className={styles.downloadButtonFixed}
          onClick={downloadInvoice}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <span className="material-symbols-outlined">hourglass_empty</span>
              Downloading...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">download</span>
              Download Invoice
            </>
          )}
        </button>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCancelModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#ef4444' }}>warning</span>
              <h2 className={styles.modalTitle}>Cancel Order?</h2>
            </div>
            <p className={styles.modalMessage}>
              Are you sure you want to cancel this order? This action cannot be undone.
              {orderData?.payment_status === 'captured' && (
                <span className={styles.modalWarning}>
                  <br /><br />
                  Your payment will be refunded to the original payment method.
                </span>
              )}
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalButtonSecondary}
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
              >
                Keep Order
              </button>
              <button
                className={styles.modalButtonDanger}
                onClick={handleCancelOrder}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {cancelSuccess && (
        <div className={styles.successToast}>
          <span className="material-symbols-outlined">check_circle</span>
          <span>Order cancelled successfully</span>
        </div>
      )}

      {/* Error Message */}
      {cancelError && (
        <div className={styles.errorToast}>
          <span className="material-symbols-outlined">error</span>
          <span>{cancelError}</span>
          <button onClick={() => setCancelError(null)} className={styles.toastClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function OrderDetailsPage() {
  return (
    <SessionGuard>
      <OrderDetailsPageContent />
    </SessionGuard>
  );
}
