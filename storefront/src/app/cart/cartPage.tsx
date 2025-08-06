'use client';

import React, { useEffect, useState } from 'react';
import Header from '../../components/Header';
import styles from './cartPage.module.css';
import Link from 'next/link';
import { useCart } from '../../contexts/CartContext';
import CartFeedback from '../../components/CartFeedback/CartFeedback';
import NetworkStatus from '../../components/NetworkStatus/NetworkStatus';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import CartErrorBoundary from '../../components/CartErrorBoundary/CartErrorBoundary';

export default function CartPage() {
  const { 
    cart, 
    loading, 
    error, 
    refreshCart, 
    updateQuantity, 
    removeFromCart, 
    clearError, 
    retryLastOperation, 
    isRetryable 
  } = useCart();
  
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Refresh cart data when component mounts
  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // Format currency to INR
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount / 100); // Medusa stores amounts in cents
  };

  // Clear operation feedback after delay
  const clearOperationFeedback = () => {
    setTimeout(() => {
      setOperationSuccess(null);
      setOperationError(null);
    }, 3000);
  };

  // Handle quantity increase
  const handleQuantityIncrease = async (lineItemId: string, currentQuantity: number) => {
    setOperationLoading(`increase-${lineItemId}`);
    setOperationError(null);
    setOperationSuccess(null);
    
    try {
      await updateQuantity(lineItemId, currentQuantity + 1);
      setOperationSuccess('Quantity updated successfully');
      clearOperationFeedback();
    } catch (error) {
      console.error('Failed to increase quantity:', error);
      setOperationError('Failed to increase quantity. Please try again.');
      clearOperationFeedback();
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle quantity decrease
  const handleQuantityDecrease = async (lineItemId: string, currentQuantity: number) => {
    setOperationLoading(`decrease-${lineItemId}`);
    setOperationError(null);
    setOperationSuccess(null);
    
    try {
      if (currentQuantity <= 1) {
        // Remove item if quantity would become 0
        await removeFromCart(lineItemId);
        setOperationSuccess('Item removed from cart');
      } else {
        await updateQuantity(lineItemId, currentQuantity - 1);
        setOperationSuccess('Quantity updated successfully');
      }
      clearOperationFeedback();
    } catch (error) {
      console.error('Failed to decrease quantity:', error);
      setOperationError('Failed to update quantity. Please try again.');
      clearOperationFeedback();
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle direct quantity input change
  const handleQuantityChange = async (lineItemId: string, newQuantity: number) => {
    setOperationLoading(`update-${lineItemId}`);
    setOperationError(null);
    setOperationSuccess(null);
    
    try {
      if (newQuantity <= 0) {
        // Remove item if quantity is 0 or negative
        await removeFromCart(lineItemId);
        setOperationSuccess('Item removed from cart');
      } else {
        await updateQuantity(lineItemId, newQuantity);
        setOperationSuccess('Quantity updated successfully');
      }
      clearOperationFeedback();
    } catch (error) {
      console.error('Failed to update quantity:', error);
      setOperationError('Failed to update quantity. Please try again.');
      clearOperationFeedback();
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle retry cart refresh
  const handleRetryRefresh = async () => {
    try {
      await refreshCart();
    } catch (error) {
      console.error('Retry refresh failed:', error);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <NetworkStatus />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Shopping Cart</h1>
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner 
                  size="large" 
                  color="primary" 
                  message="Loading your cart..." 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !cart) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <NetworkStatus />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Shopping Cart</h1>
              <div className="flex flex-col justify-center items-center py-12 max-w-md mx-auto">
                <CartFeedback
                  error={error}
                  onRetry={isRetryable ? retryLastOperation : handleRetryRefresh}
                  onDismissError={clearError}
                  showRetry={true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty cart state
  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <NetworkStatus />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Shopping Cart</h1>
              
              {/* Show any cart-level errors */}
              {error && (
                <div className="mb-6">
                  <CartFeedback
                    error={error}
                    onRetry={isRetryable ? retryLastOperation : handleRetryRefresh}
                    onDismissError={clearError}
                    showRetry={true}
                  />
                </div>
              )}
              
              <div className="flex flex-col justify-center items-center py-12">
                <div className="text-xl text-gray-600 mb-4">Your cart is empty</div>
                <p className="text-gray-500 mb-6">Add some beautiful stone idols to get started!</p>
                <Link href="/products">
                  <button className={styles.continueShoppingButton}>
                    Continue Shopping
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cart with items - display real cart data
  return (
    <div 
      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        <Header />
        <NetworkStatus />
        
        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <CartErrorBoundary>
            <div className={styles.container}>
            <h1 className={styles.title}>Shopping Cart</h1>
            
            {/* Cart-level feedback */}
            <div className="mb-6">
              <CartFeedback
                error={error || operationError}
                success={operationSuccess}
                onRetry={isRetryable ? retryLastOperation : handleRetryRefresh}
                onDismissError={() => {
                  clearError();
                  setOperationError(null);
                }}
                onDismissSuccess={() => setOperationSuccess(null)}
                showRetry={!!error && isRetryable}
              />
            </div>
            
            {/* Cart table */}
            <div className={styles.itemsBox}>
              <table className={styles.cartTable}>
                <thead className={styles.cartTableHeader}>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.itemCell}>
                          <img 
                            src={item.thumbnail || item.variant.product.thumbnail || '/placeholder-image.jpg'} 
                            alt={item.title} 
                            className={styles.itemImage}
                          />
                          <div className={styles.itemDetails}>
                            <span className={styles.itemName}>{item.title}</span>
                            {item.variant.title && (
                              <span className={styles.itemVariant}>{item.variant.title}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={styles.priceCell}>{formatCurrency(item.unit_price)}</td>
                      <td className={styles.quantityCell}>
                        <div className={styles.quantityControls}>
                          <button 
                            className={styles.quantityButton}
                            onClick={() => handleQuantityDecrease(item.id, item.quantity)}
                            disabled={loading || operationLoading === `decrease-${item.id}`}
                            aria-label="Decrease quantity"
                          >
                            {operationLoading === `decrease-${item.id}` ? (
                              <LoadingSpinner size="small" color="gray" />
                            ) : (
                              '−'
                            )}
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const newQuantity = parseInt(e.target.value, 10);
                              if (!isNaN(newQuantity) && newQuantity >= 0) {
                                handleQuantityChange(item.id, newQuantity);
                              }
                            }}
                            className={styles.quantityInput}
                            min="0"
                            disabled={loading || operationLoading?.includes(item.id)}
                            aria-label="Item quantity"
                          />
                          <button 
                            className={styles.quantityButton}
                            onClick={() => handleQuantityIncrease(item.id, item.quantity)}
                            disabled={loading || operationLoading === `increase-${item.id}`}
                            aria-label="Increase quantity"
                          >
                            {operationLoading === `increase-${item.id}` ? (
                              <LoadingSpinner size="small" color="gray" />
                            ) : (
                              '+'
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={styles.priceCell}>
                        <strong>{formatCurrency(item.subtotal)}</strong>
                      </td>
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
                <span className={styles.summaryValue}>{formatCurrency(cart.subtotal)}</span>
              </div>
              
              {cart.tax_total > 0 && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Tax</span>
                  <span className={styles.summaryValue}>{formatCurrency(cart.tax_total)}</span>
                </div>
              )}
              
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Shipping</span>
                <span className={styles.summaryValue}>
                  {cart.shipping_total > 0 ? formatCurrency(cart.shipping_total) : 'Free'}
                </span>
              </div>
              
              {cart.discount_total > 0 && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Discount</span>
                  <span className={styles.summaryValue}>-{formatCurrency(cart.discount_total)}</span>
                </div>
              )}
              
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalValue}>{formatCurrency(cart.total)}</span>
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
          </CartErrorBoundary>
        </div>
      </div>
    </div>
  );
} 