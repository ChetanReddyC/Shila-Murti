'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '../../components/Header';
import styles from './checkoutPage.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../contexts/CartContext';

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

  // Shipping method state
  const [shippingMethod, setShippingMethod] = useState('standard');

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

  // Client-side shipping charges (INR) mapped to selected method
  const selectedShippingCharge =
    shippingMethod === 'express' ? 1600 :
    shippingMethod === 'expedited' ? 800 : 0;

  // Choose the higher of backend shipping and the user's selected tier
  const effectiveShippingAmount = Math.max(backendShippingAmount, selectedShippingCharge);

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
    
    // Shipping method selection (1 field)
    totalFields += 1;
    if (shippingMethod) filledFields++; // Always filled since we have a default
    
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
  }, [formData, shippingMethod, paymentMethod, paymentDetails]);

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
  const handleShippingMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShippingMethod(e.target.value);
  };

  // Handle payment method change
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentMethod(e.target.value);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent UI glitch by not mutating CartContext in this page at all.
    // We only persist a snapshot and navigate; cart clearing will happen on the confirmation page.

    // Build a serializable snapshot of exactly what was submitted
    const orderSnapshot = {
      timestamp: Date.now(),
      cartId: cart?.id ?? null,
      customer: formData,
      shippingSelection: {
        method: shippingMethod,
        amount: effectiveShippingAmount,
      },
      paymentMethod,
      items: cartItems.map((it) => ({
        id: it.id,
        title: it.title,
        quantity: it.quantity,
        unit_price: Number(it.unit_price || 0),
        thumbnail: (it as any)?.thumbnail ?? (it as any)?.variant?.product?.thumbnail ?? null,
        variant_id: (it as any)?.variant_id ?? (it as any)?.variant?.id ?? null,
        product_id: (it as any)?.variant?.product_id ?? (it as any)?.variant?.product?.id ?? null,
      })),
      totals: {
        subtotal,
        shipping: effectiveShippingAmount,
        taxes,
        total,
      },
    };

    try {
      // Persist snapshot in sessionStorage with a short TTL
      const payload = {
        data: orderSnapshot,
        // TTL: 30 minutes from now
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      sessionStorage.setItem('order_checkout_snapshot', JSON.stringify(payload));
    } catch (err) {
      console.warn('[Checkout] Failed to persist order snapshot to sessionStorage:', err);
    }

    // Process the order using real cart items (console log retained for visibility)
    console.log('Order submitted:', orderSnapshot);

    // Navigate immediately; DO NOT clear the cart here to avoid any flicker.
    router.push('/order-confirmation');
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
                  <div className={styles.shippingOption}>
                    <input 
                      type="radio" 
                      id="standard" 
                      name="shippingMethod" 
                      value="standard" 
                      checked={shippingMethod === 'standard'} 
                      onChange={handleShippingMethodChange} 
                      className={styles.radioInput} 
                    />
                    <label htmlFor="standard" className={styles.radioLabel}>
                      <div className={styles.shippingOptionDetails}>
                        <div className={styles.shippingOptionName}>Standard (5-7 business days)</div>
                        <div className={styles.shippingOptionPrice}>Free</div>
                      </div>
                    </label>
                  </div>
                  
                  <div className={styles.shippingOption}>
                    <input 
                      type="radio" 
                      id="expedited" 
                      name="shippingMethod" 
                      value="expedited" 
                      checked={shippingMethod === 'expedited'} 
                      onChange={handleShippingMethodChange} 
                      className={styles.radioInput} 
                    />
                    <label htmlFor="expedited" className={styles.radioLabel}>
                      <div className={styles.shippingOptionDetails}>
                        <div className={styles.shippingOptionName}>Expedited (2-3 business days)</div>
                        <div className={styles.shippingOptionPrice}>₹800.00</div>
                      </div>
                    </label>
                  </div>
                  
                  <div className={styles.shippingOption}>
                    <input 
                      type="radio" 
                      id="express" 
                      name="shippingMethod" 
                      value="express" 
                      checked={shippingMethod === 'express'} 
                      onChange={handleShippingMethodChange} 
                      className={styles.radioInput} 
                    />
                    <label htmlFor="express" className={styles.radioLabel}>
                      <div className={styles.shippingOptionDetails}>
                        <div className={styles.shippingOptionName}>Express (1-2 business days)</div>
                        <div className={styles.shippingOptionPrice}>₹1600.00</div>
                      </div>
                    </label>
                  </div>
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
