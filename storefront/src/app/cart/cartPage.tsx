'use client';

import React, { useEffect, useState } from 'react';
import styles from './cartPage.module.css';
import Link from 'next/link';
import { useCart } from '../../contexts/CartContext';
import CartFeedback from '../../components/CartFeedback/CartFeedback';
import NetworkStatus from '../../components/NetworkStatus/NetworkStatus';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import CartErrorBoundary from '../../components/CartErrorBoundary/CartErrorBoundary';
import { PriceCalculationService } from '../../services/PriceCalculationService';

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
  // Removed operationSuccess/operationError feedback for quantity changes (no popups)
  // const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  // const [operationError, setOperationError] = useState<string | null>(null);

  // Performance Enhancement: Removed redundant refreshCart() call
  // CartContext already loads cart on initialization - no need to call it again here
  // This was causing N+1 query problem (multiple concurrent API calls on mount)

  // Use centralized currency formatting
  // NOTE: Our backend amounts are already stored in rupees (not cents).

  // Clear operation feedback after delay
  // Removed popup feedback; keep a no-op to avoid refactoring handlers extensively
  const clearOperationFeedback = () => { };

  // Handle quantity increase
  const handleQuantityIncrease = async (lineItemId: string, currentQuantity: number) => {
    setOperationLoading(`increase-${lineItemId}`);
    try {
      await updateQuantity(lineItemId, currentQuantity + 1);
    } catch (error) {
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle quantity decrease
  const handleQuantityDecrease = async (lineItemId: string, currentQuantity: number) => {
    setOperationLoading(`decrease-${lineItemId}`);
    try {
      if (currentQuantity <= 1) {
        await removeFromCart(lineItemId);
      } else {
        await updateQuantity(lineItemId, currentQuantity - 1);
      }
    } catch (error) {
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle direct quantity input change
  const handleQuantityChange = async (lineItemId: string, newQuantity: number) => {
    setOperationLoading(`update-${lineItemId}`);
    try {
      if (newQuantity <= 0) {
        await removeFromCart(lineItemId);
      } else {
        await updateQuantity(lineItemId, newQuantity);
      }
    } catch (error) {
    } finally {
      setOperationLoading(null);
    }
  };

  // Handle retry cart refresh
  const handleRetryRefresh = async () => {
    try {
      await refreshCart();
    } catch (error) {
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

  // Calculate subtotal from actual item prices to ensure consistency
  const calculatedSubtotal = cart.items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0);

  // Cart with items - display real cart data
  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden"
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif', paddingTop: '100px' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        <NetworkStatus />

        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
          <CartErrorBoundary>
            <div className={styles.container}>
              <h1 className={styles.title}>Shopping Cart</h1>

              {/* Cart-level feedback */}
              {/* Removed success/error popups for quantity updates */}
              {error && (
                <div className="mb-6">
                  <CartFeedback
                    error={error}
                    onRetry={isRetryable ? retryLastOperation : handleRetryRefresh}
                    onDismissError={clearError}
                    showRetry={!!error && isRetryable}
                  />
                </div>
              )}

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
                              src={(item?.thumbnail ?? item?.variant?.product?.thumbnail ?? '/placeholder-image.jpg')}
                              alt={(item?.title ?? 'Cart item')}
                              className={styles.itemImage}
                            />
                            <div className={styles.itemDetails}>
                              <span className={styles.itemName}>{item?.title ?? 'Item'}</span>
                              {!!item?.variant?.title && (
                                <span className={styles.itemVariant}>{item.variant.title}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={styles.priceCell}>{PriceCalculationService.formatCurrency(Number(item.unit_price), cart?.currency_code)}</td>
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
                          <strong>
                            {PriceCalculationService.formatCurrency(
                              typeof item?.subtotal === 'number' && !Number.isNaN(item.subtotal)
                                ? Number(item.subtotal)
                                : (Number(item?.unit_price ?? 0) * Number(item?.quantity ?? 0)),
                              cart?.currency_code
                            )}
                          </strong>
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
                  <span className={styles.summaryValue}>
                    {PriceCalculationService.formatCurrency(calculatedSubtotal, cart?.currency_code)}
                  </span>
                </div>

                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Taxes</span>
                  <span className={styles.summaryValue}>{PriceCalculationService.formatCurrency(0, cart?.currency_code)}</span>
                </div>

                {cart.discount_total > 0 && (
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Discount</span>
                    <span className={styles.summaryValue}>-{PriceCalculationService.formatCurrency(Number(cart.discount_total), cart?.currency_code)}</span>
                  </div>
                )}

                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Total</span>
                  <span className={styles.totalValue}>
                    {PriceCalculationService.formatCurrency(
                      calculatedSubtotal + 0 - Number(cart.discount_total || 0),
                      cart?.currency_code
                    )}
                  </span>
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
