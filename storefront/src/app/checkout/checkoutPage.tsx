'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '../../components/Header';
import styles from './checkoutPage.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Real product data from the products page
const products = [
  {
    id: 1,
    name: "Stone Idol",
    price: 50,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDLuyJZ0xxw_l9UUZPYMMLIG5k9I8fiVs6lcmflwE_12DaUsTg9Zz4nHSGXRPCWuHcGg4SgqHcaFm5a2_OlvZj6CgnY-9pNDVRy1WIJbv-LWBQ6lE_k-teSL6Da366eZQ323rHVwrTqos9EKSJ5ucUGKwNhtdwJUbaznsE3Cu0SrlKj-M76eTRkXlyudU1atflukUlrRQe7bxiAY2yA5vrHir7LVQrFeRh1mDe9IrNGiY-uJvCQPWB2_GI_YqTIEF9MvM-HuI1oleSI"
  }
];

export default function CheckoutPage() {
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

  // Cart items
  const cartItems = [
    {
      ...products[0],
      quantity: 1
    }
  ];
  
  // Calculate subtotal
  const subtotal = 50;
  
  // Shipping is free
  const shipping = 'Free';
  
  // Taxes
  const taxes = 5;
  
  // Total amount
  const total = subtotal + taxes;

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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Process the order
    console.log('Order submitted:', {
      customer: formData,
      shippingMethod,
      paymentMethod,
      paymentDetails,
      items: cartItems,
      total
    });
    router.push('/order-confirmation');
  };

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
                        <div className={styles.shippingOptionPrice}>$10</div>
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
                        <div className={styles.shippingOptionPrice}>$20</div>
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
                          src={item.image} 
                          alt={item.name} 
                          className={styles.orderItemImage} 
                        />
                        <div>
                          <p className={styles.orderItemName}>{item.name}</p>
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
                    <span className={styles.summaryValue}>${subtotal}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Shipping</span>
                    <span className={styles.summaryValue}>{shipping}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Taxes</span>
                    <span className={styles.summaryValue}>${taxes}</span>
                  </div>
                  
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>${total}</span>
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