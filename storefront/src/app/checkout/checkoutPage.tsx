'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '../../components/Header';
import styles from './checkoutPage.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../contexts/CartContext';
import { processCheckout } from '../../utils/checkoutOrchestrator';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, loading, refreshCart, clearCart } = useCart();

  // Ensure we have fresh cart data when entering checkout
  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    contactNumber: ''
  });

  // Shipping method selection is driven by backend option ids

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState('creditCard');
  
  // Payment details
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: ''
  });

  // Derive cart-based values
  const cartItems = cart?.items ?? [];

  // Helpers for currency formatting (INR as per cart page)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(amount || 0));
  };

  const subtotal = Number(cart?.subtotal ?? 0);
  const backendShippingAmount = Number(cart?.shipping_total ?? 0);

  // Shipping options and dynamic amounts sourced from backend at runtime
  const [shippingOptions, setShippingOptions] = useState<Array<{ id: string; name: string; amount: number; estimate?: string }>>([])
  // Derive an estimated delivery text for a shipping option
  const getEstimate = (name: string, metadata?: Record<string, any>): string | undefined => {
    if (metadata) {
      const text = (metadata as any).delivery_estimate_text
      const min = Number((metadata as any).min_days)
      const max = Number((metadata as any).max_days)
      if (typeof text === 'string' && text.trim()) return text.trim()
      if (!Number.isNaN(min) && !Number.isNaN(max) && min > 0 && max >= min) {
        return `${min}-${max} business days`
      }
      if (!Number.isNaN(min) && min > 0) {
        return `${min} business days`
      }
    }
    const lower = name.toLowerCase()
    if (lower.includes('express') || lower.includes('overnight') || lower.includes('one-day') || lower.includes('1-2')) return '1-2 business days'
    if (lower.includes('expedited') || lower.includes('priority') || lower.includes('fast')) return '2-3 business days'
    if (lower.includes('standard') || lower.includes('economy') || lower.includes('ground') || lower.includes('regular') || lower.includes('free')) return '5-7 business days'
    return undefined
  }

  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState<string | null>(null)

  // Load eligible shipping options for the current cart
  useEffect(() => {
    const load = async () => {
      if (!cart?.id) return
      try {
        const options = await (async () => {
          // Use the medusaApiClient via dynamic import to avoid circular deps
          const { medusaApiClient } = await import('../../utils/medusaApiClient')
          return medusaApiClient.getShippingOptionsForCart(cart.id)
        })()
        const normalized = (options || []).map((o: any) => ({
          id: o.id,
          name: String(o.name || ''),
          amount: Number(o.amount ?? 0),
          estimate: getEstimate(String(o.name || ''), (o as any).metadata || (o as any).data)
        }))
        // Sort by amount ascending for stable order
        normalized.sort((a, b) => Number(a.amount) - Number(b.amount))
        setShippingOptions(normalized)
        // Default to the first option if none selected yet
        setSelectedShippingOptionId((prev) => prev ?? (normalized[0]?.id || null))
      } catch (e) {
        console.warn('[Checkout] Failed to load shipping options', e)
      }
    }
    load()
  }, [cart?.id])

  // Use the backend option amount when we have a selected option; fallback to backend shipping_total
  const selectedOptionAmount = (() => {
    const found = shippingOptions.find((o) => o.id === selectedShippingOptionId)
    return typeof found?.amount === 'number' ? Number(found.amount) : undefined
  })()
  const effectiveShippingAmount = typeof selectedOptionAmount === 'number' ? selectedOptionAmount : backendShippingAmount

  const shipping = effectiveShippingAmount > 0 ? formatCurrency(effectiveShippingAmount) : 'Free';
  const taxes = Number(cart?.tax_total ?? 0);

  // Always compute total on the client to reflect selected shipping immediately
  const total = subtotal + effectiveShippingAmount + taxes;

  // Progress state for entire checkout form
  const [formProgress, setFormProgress] = useState(0);
  // State to track if progress bar should be sticky
  const [isProgressBarSticky, setIsProgressBarSticky] = useState(false);
  // Reference to the original progress bar
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  // Calculate form completion progress for the entire checkout
  useEffect(() => {
    let filledFields = 0;
    let totalFields = 0;
    
    // Shipping fields (6 fields)
    totalFields += 6;
    if (formData.name) filledFields++;
    if (formData.address) filledFields++;
    if (formData.city) filledFields++;
    if (formData.state) filledFields++;
    if (formData.postalCode) filledFields++;
    if (formData.contactNumber) filledFields++;
    
    // Shipping option selection (1 field)
    totalFields += 1;
    if (selectedShippingOptionId) filledFields++;
    
    // Payment method selection (1 field)
    totalFields += 1;
    if (paymentMethod) filledFields++; // Always filled since we have a default
    
    // Payment details (only counted if credit card is selected)
    if (paymentMethod === 'creditCard') {
      totalFields += 3; // cardNumber, expiryDate, cvv
      if (paymentDetails.cardNumber) filledFields++;
      if (paymentDetails.expiryDate) filledFields++;
      if (paymentDetails.cvv) filledFields++;
    }
    
    const progress = (filledFields / totalFields) * 100;
    setFormProgress(progress);
  }, [formData, selectedShippingOptionId, paymentMethod, paymentDetails]);

  // Add scroll event listener to check if progress bar should be sticky
  useEffect(() => {
    const handleScroll = () => {
      if (progressBarRef.current) {
        const progressBarRect = progressBarRef.current.getBoundingClientRect();
        // Make the bar sticky when it's about to scroll off the top (accounting for header)
        const headerHeight = 65 + 16; // header height + its margin
        setIsProgressBarSticky(progressBarRect.top <= headerHeight);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handle payment details changes
  const handlePaymentDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPaymentDetails({
      ...paymentDetails,
      [name]: value
    });
  };

  // Handle shipping method change
  const handleShippingOptionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedShippingOptionId(e.target.value)
  }

  // Handle payment method change
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentMethod(e.target.value);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart || !cart.id || cartItems.length === 0) {
      console.warn('[Checkout] Cannot submit without a valid cart and items');
      return;
    }

    // Orchestrate checkout using backend (cheapest shipping, manual payment)
    try {
      const result = await processCheckout({
        cartId: cart.id,
        cartUpdate: {
          // Email is optional in the current form; if needed, add an email field later
          shipping_address: {
            first_name: formData.name || 'Customer',
            address_1: formData.address,
            city: formData.city,
            postal_code: formData.postalCode,
            province: formData.state,
            country_code: 'in',
            phone: formData.contactNumber || undefined,
          },
        },
        strategy: 'cheapest',
        useManualPayment: true,
        selectedShippingAmount: effectiveShippingAmount,
        selectedOptionIds: selectedShippingOptionId ? [selectedShippingOptionId] : [],
      });

      if (result.success && result.order) {
        try {
          sessionStorage.setItem('order_result', JSON.stringify({
            orderId: result.order.id,
            displayId: result.order.display_id,
            timestamp: Date.now(),
          }));
        } catch {}
        router.push(`/order-confirmation?order_id=${encodeURIComponent(result.order.id)}`);
        return;
      }

      // Fallback: store an error snapshot for display
      console.warn('[Checkout] Checkout failed at step:', result.error?.step, result);
      alert(result.error?.message || 'Checkout failed. Please try again.');
    } catch (error: any) {
      console.error('[Checkout] Unexpected error during checkout:', error);
      alert(error?.message || 'Unexpected error during checkout');
    }
  };

  // Loading or empty cart states - prevent proceeding with no items
  if (loading) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Checkout</h1>
              <div className="text-gray-600">Loading your cart...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!cart || !cartItems || cartItems.length === 0) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Checkout</h1>
              <div className="flex flex-col items-center gap-4">
                <div className="text-gray-600">Your cart is empty.</div>
                <Link href="/products">
                  <button className={styles.placeOrderButton}>Browse Products</button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header showProgress={isProgressBarSticky} progress={formProgress} />
        
        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <div className={styles.container}>
            {/* Breadcrumb Navigation */}
            <div className={styles.breadcrumb}>
              <Link href="/">Home</Link>
              <span> / </span>
              <span>Checkout</span>
            </div>
            
            <h1 className={styles.title}>Checkout</h1>
            
            <form onSubmit={handleSubmit}>
              {/* Shipping Information Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Shipping Information</h2>
                {/* Original progress bar that will be replaced by sticky one when scrolled */}
                <div className={styles.formDivider} ref={progressBarRef}>
                  <div 
                    className={styles.formDividerProgress} 
                    style={{ width: `${formProgress}%` }}
                  ></div>
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="name" className={styles.label}>Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    className={styles.input} 
                    value={formData.name} 
                    onChange={handleInputChange} 
                    placeholder="Enter your name"
                    required 
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="address" className={styles.label}>Address</label>
                  <input 
                    type="text" 
                    id="address" 
                    name="address" 
                    className={styles.input} 
                    value={formData.address} 
                    onChange={handleInputChange} 
                    placeholder="Enter your address"
                    required 
                  />
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="city" className={styles.label}>City</label>
                    <input 
                      type="text" 
                      id="city" 
                      name="city" 
                      className={styles.input} 
                      value={formData.city} 
                      onChange={handleInputChange} 
                      placeholder="Enter your city"
                      required 
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="state" className={styles.label}>State</label>
                    <input 
                      type="text" 
                      id="state" 
                      name="state" 
                      className={styles.input} 
                      value={formData.state} 
                      onChange={handleInputChange} 
                      placeholder="Enter your state"
                      required 
                    />
                  </div>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="postalCode" className={styles.label}>Postal Code</label>
                    <input 
                      type="text" 
                      id="postalCode" 
                      name="postalCode" 
                      className={styles.input} 
                      value={formData.postalCode} 
                      onChange={handleInputChange} 
                      placeholder="Enter your postal code"
                      required 
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="contactNumber" className={styles.label}>Contact Number</label>
                    <input 
                      type="text" 
                      id="contactNumber" 
                      name="contactNumber" 
                      className={styles.input} 
                      value={formData.contactNumber} 
                      onChange={handleInputChange} 
                      placeholder="Enter your contact number"
                      required 
                    />
                  </div>
                </div>
              </div>
              
              {/* Shipping Method Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Shipping Method</h2>
                
                <div className={styles.shippingOptions}>
                  {(shippingOptions || []).map((opt) => (
                    <div key={opt.id} className={styles.shippingOption}>
                      <input
                        type="radio"
                        id={`ship_${opt.id}`}
                        name="shippingOptionId"
                        value={opt.id}
                        checked={selectedShippingOptionId === opt.id}
                        onChange={handleShippingOptionIdChange}
                        className={styles.radioInput}
                      />
                      <label htmlFor={`ship_${opt.id}`} className={styles.radioLabel}>
                        <div className={styles.shippingOptionDetails}>
                          <div className={styles.shippingOptionName}>
                            {opt.name || 'Shipping'}{opt.estimate ? ` (${opt.estimate})` : ''}
                          </div>
                          <div className={styles.shippingOptionPrice}>
                            {opt.amount > 0 ?
                              new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(opt.amount))
                              : 'Free'}
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Payment Information Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Payment Information</h2>
                
                <div className={styles.paymentOptions}>
                  <div className={styles.paymentOption}>
                    <input 
                      type="radio" 
                      id="creditCard" 
                      name="paymentMethod" 
                      value="creditCard" 
                      checked={paymentMethod === 'creditCard'} 
                      onChange={handlePaymentMethodChange} 
                      className={styles.radioInput} 
                    />
                    <label htmlFor="creditCard" className={styles.radioLabel}>
                      Credit Card
                    </label>
                  </div>
                  
                  <div className={styles.paymentOption}>
                    <input 
                      type="radio" 
                      id="paypal" 
                      name="paymentMethod" 
                      value="paypal" 
                      checked={paymentMethod === 'paypal'} 
                      onChange={handlePaymentMethodChange} 
                      className={styles.radioInput} 
                    />
                    <label htmlFor="paypal" className={styles.radioLabel}>
                      PayPal
                    </label>
                  </div>
                  <div className={styles.paymentOption}>
                    <input
                      type="radio"
                      id="upi"
                      name="paymentMethod"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={handlePaymentMethodChange}
                      className={styles.radioInput}
                    />
                    <label htmlFor="upi" className={styles.radioLabel}>
                      UPI
                    </label>
                  </div>
                </div>
                
                {paymentMethod === 'creditCard' && (
                  <div className={styles.paymentDetails}>
                    <div className={styles.formGroup}>
                      <label htmlFor="cardNumber" className={styles.label}>Card Number</label>
                      <input 
                        type="text" 
                        id="cardNumber" 
                        name="cardNumber" 
                        className={styles.input} 
                        value={paymentDetails.cardNumber} 
                        onChange={handlePaymentDetailsChange} 
                        placeholder="Enter card number" 
                        required 
                      />
                    </div>
                    
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label htmlFor="expiryDate" className={styles.label}>Expiration Date</label>
                        <input 
                          type="text" 
                          id="expiryDate" 
                          name="expiryDate" 
                          className={styles.input} 
                          value={paymentDetails.expiryDate} 
                          onChange={handlePaymentDetailsChange} 
                          placeholder="MM/YY" 
                          required 
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label htmlFor="cvv" className={styles.label}>CVV</label>
                        <input 
                          type="text" 
                          id="cvv" 
                          name="cvv" 
                          className={styles.input} 
                          value={paymentDetails.cvv} 
                          onChange={handlePaymentDetailsChange} 
                          placeholder="Enter CVV" 
                          required 
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Order Summary Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Order Summary</h2>
                
                {/* Order items */}
                <div className={styles.orderItems}>
                  {cartItems.map(item => (
                    <div key={item.id} className={styles.orderItem}>
                      <div className={styles.orderItemDetails}>
                        <img 
                          src={(item?.thumbnail ?? item?.variant?.product?.thumbnail ?? '/placeholder-image.jpg')}
                          alt={(item?.title ?? 'Cart item')} 
                          className={styles.orderItemImage} 
                        />
                        <div>
                          <p className={styles.orderItemName}>{item?.title ?? 'Item'}</p>
                          <p className={styles.orderItemQuantity}>Quantity: {item.quantity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Price summary */}
                <div className={styles.priceSummary}>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Subtotal</span>
                    <span className={styles.summaryValue}>{formatCurrency(subtotal)}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Shipping</span>
                    <span className={styles.summaryValue}>{shipping}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Taxes</span>
                    <span className={styles.summaryValue}>{formatCurrency(taxes)}</span>
                  </div>
                  
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>{formatCurrency(total)}</span>
                  </div>
                </div>
                
                <button type="submit" className={styles.placeOrderButton}>
                  Place Order
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
