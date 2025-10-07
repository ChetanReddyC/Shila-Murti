'use client';

import React, { useEffect, useState } from 'react';
import Header from '../../../../components/Header';
import { useParams } from 'next/navigation';
import styles from './page.module.css';

type OrderStage = 'Placed' | 'Processed' | 'Shipped' | 'Delivered';

interface OrderItem {
  title: string;
  quantity: number;
  unit_price: number;
}

interface OrderData {
  id: string;
  display_id: string;
  created_at: string;
  items: OrderItem[];
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  status: string;
  fulfillment_status: string;
  shipping_address?: {
    address_1: string;
    city: string;
    postal_code: string;
  };
  billing_address?: {
    address_1: string;
    city: string;
    postal_code: string;
  };
}

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

        const res = await fetch(`/api/account/orders?customer_id=${encodeURIComponent(customerId)}`);
        if (res.ok) {
          const json = await res.json();
          const orders: any[] = Array.isArray(json?.orders) ? json.orders : [];
          const order = orders.find(o => o.id === orderId);
          if (order) {
            setOrderData(order);
          }
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
                  <p className={styles.sectionTime}>August 15, 2023 at 10:00 AM</p>
                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <p className={styles.itemsTitle}>Items:</p>
                      <div className={styles.itemRow}>
                        <img
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAnu3awfpgr3uSWHku9rc_wmzpjlxrODRpp7uzpt0qikzWTJyP4_ter_FspWxwbtyyO60Zyz9dpwZvYq-Gixi-ySzk6DljLPHd6Rkcn-3tGk5oH0Gu4QTTWunP6quJpqy8ghMO7_EG3q4KkaGeZf4rMXLbvT-k_s7GfB9N0vvHEQd0OBVKvkJVSMeKuuGS7xRe0kSEE7TsiVKEj_b96yqIk--X9gleHauIBi7fS5Vxs81R_Tr9Tx-02FHovgcHBuf7zYKRq5wOT81Br"
                          alt="Stone Idol of Ganesha"
                          className={styles.itemImage}
                        />
                        <div className={styles.itemDetails}>
                          <p className={styles.itemTitle}>Stone Idol of Ganesha</p>
                          <p className={styles.itemMeta}>Quantity: 1 | Price: $150</p>
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.summaryContainer}>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Subtotal</p>
                          <p className={styles.summaryValue}>$150</p>
                        </div>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Shipping</p>
                          <p className={styles.summaryValue}>$10</p>
                        </div>
                        <div className={styles.summaryRow}>
                          <p className={styles.summaryLabel}>Taxes</p>
                          <p className={styles.summaryValue}>$0</p>
                        </div>
                        <div className={styles.totalRow}>
                          <p className={styles.totalLabel}>Total</p>
                          <p className={styles.totalValue}>$160</p>
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
                  <p className={styles.sectionTime}>August 16, 2023 at 09:00 AM</p>
                  <div className={styles.card}>
                    <div className={styles.cardBody}>
                      <div className={styles.detailsContainer}>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Shipping Address</p>
                          <p className={styles.detailValue}>123 Main Street, Anytown, 12345</p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Shipping Method</p>
                          <p className={styles.detailValue}>Standard Shipping</p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Billing Address</p>
                          <p className={styles.detailValue}>123 Main Street, Anytown, 12345</p>
                        </div>
                        <div className={styles.detailRow}>
                          <p className={styles.detailLabel}>Payment Method</p>
                          <p className={styles.detailValue}>MasterCard ending in 1234</p>
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
                  <p className={styles.sectionTime}>August 17, 2023 at 02:00 PM</p>
                  <div className={styles.card}>
                    <div className={styles.cardBody}>
                      <p className={styles.trackingTitle}>Tracking Information:</p>
                      <p className={styles.trackingNumber}>Tracking Number: 9876543210</p>
                      <a className={styles.trackingLink} href="#">
                        Track your order on the carrier's website
                      </a>
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
                  <p className={styles.sectionTimeBase}>Estimated Delivery: August 20, 2023</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
