'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { notFound } from 'next/navigation';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../../services/productsService';
import { ProductCardData } from '../../../utils/productDataMapper';
import { Product } from '../../../types/medusa';
import { useRetry } from '../../../hooks/useRetry';
import { isValidHandle, generateProductHandle } from '../../../utils/productHandleGenerator';
import { useCart } from '../../../contexts/CartContext';
import { medusaApiClient } from '../../../utils/medusaApiClient';
import styles from './ProductDetailPage.module.css'

import ReviewsSection from './ReviewsSection';
import SimilarProductsSection from './SimilarProductsSection';
import CartFeedback from '../../../components/CartFeedback/CartFeedback';
import NetworkStatus from '../../../components/NetworkStatus/NetworkStatus';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';

interface ProductDetailPageProps {
  params: Promise<{ handle: string }>;
}

interface ProductDetailState {
  product: Product | null;
  productData: ProductCardData | null;
  loading: boolean;
  error: ProductsServiceError | null;
  handle: string | null;
  selectedQuantity: number;
  imageLoaded: boolean;
  isAddingToCart: boolean;
  showImageZoom: boolean;
  recentlyViewed: ProductCardData[];
  addToCartSuccess: boolean;
  addToCartError: string | null;
}

// Collapsible description component - moved outside to prevent re-creation on every render
const DescriptionWithExpand: React.FC<{ text: string }> = React.memo(({ text }) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(prev => !prev);
  }, []);

  return (
    <div className={styles.productWrapper} style={{ gap: '1rem' }}>
      <h3 className={styles.descriptionHeading}>Description</h3>

      <div className={`${styles.descriptionWrapper} ${expanded ? styles.expanded : styles.collapsed}`}>
        <p id="product-description" className={styles.descriptionText} style={{ color: '#6b7280', fontSize: '1rem', lineHeight: '1.6' }}>
          {text}
        </p>
        {!expanded && (
          <div
            className={styles.fadeMask}
            aria-hidden="true"
            style={{
              // Extremely soft so underlying lines remain clearly readable
              backdropFilter: 'blur(1px) saturate(100%)',
              WebkitBackdropFilter: 'blur(1px) saturate(100%)',
              // Remove SVG distortion to avoid heavy smearing of text
              filter: 'none',
              isolation: 'isolate',
              opacity: 0.85,
            }}
          />
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={handleToggle}
          className={styles.readMoreButton}
          aria-expanded={expanded}
          aria-controls="product-description"
        >
          <span>{expanded ? 'Read Less' : 'Read More'}</span>
          <svg
            className={styles.readMoreChevron}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            aria-hidden="true"
          >
            <path fill="currentColor" d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
          </svg>
        </button>
      </div>
    </div>
  );
});

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  // All hooks must be at the top before any conditional logic
  const [handle, setHandle] = useState<string | null>(null);
  const { addToCart, loading: cartLoading, error: cartError, clearError } = useCart();

  // Use a single state object to minimize state updates
  const [state, setState] = useState<ProductDetailState>({
    product: null,
    productData: null,
    loading: true,
    error: null,
    handle: null,
    selectedQuantity: 1,
    imageLoaded: false,
    isAddingToCart: false,
    showImageZoom: false,
    recentlyViewed: [],
    addToCartSuccess: false,
    addToCartError: null
  });

  // Use ref to track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Use the retry hook with exponential backoff
  const { retryCount, isRetrying, canRetry, retry, reset } = useRetry({
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000
  });

  // Optimized state update function to minimize re-renders
  const updateState = useCallback((updates: Partial<ProductDetailState>) => {
    if (!isMountedRef.current) return;

    setState(prevState => {
      // Only update if there are actual changes
      const newState = { ...prevState, ...updates };

      // Shallow comparison to prevent unnecessary updates
      if (
        newState.loading === prevState.loading &&
        newState.error === prevState.error &&
        newState.product === prevState.product &&
        newState.productData === prevState.productData &&
        newState.selectedQuantity === prevState.selectedQuantity &&
        newState.imageLoaded === prevState.imageLoaded &&
        newState.isAddingToCart === prevState.isAddingToCart &&
        newState.showImageZoom === prevState.showImageZoom
      ) {
        return prevState;
      }

      return newState;
    });
  }, []);

  // Fetch product by handle
  const fetchProductByHandle = useCallback(async () => {
    if (!handle) return;

    try {
      updateState({ loading: true, error: null, addToCartSuccess: false, addToCartError: null });

      try {
        // Fetch both the transformed product data and raw product data with variants
        const [productData, rawProduct] = await Promise.all([
          productsService.fetchProductByHandle(handle),
          medusaApiClient.getProductByHandle(handle)
        ]);

        if (isMountedRef.current) {
          // Product data already contains inventory info from ProductDataMapper
          // No need to fetch from non-existent custom endpoint
          console.log('✅ [ProductDetailPage] Using inventory from product data:', {
            inStock: productData.inStock,
            inventory: productData.inventory
          });

          updateState({
            productData: productData,
            product: rawProduct,
            loading: false
          });

          console.log('✅ [ProductDetailPage] State updated');

          // Reset retry state on successful fetch
          reset();
          // Add to recently viewed
          addToRecentlyViewed(productData);
        }
      } catch (handleError) {
        // If handle-based fetch fails, fall back to searching all products

        const allProducts = await productsService.fetchProducts();
        const matchingProduct = allProducts.find(p => {
          const productHandle = generateProductHandle(p.title);
          return productHandle === handle;
        });

        if (!matchingProduct) {
          // Product not found, trigger 404
          notFound();
          return;
        }

        // Also try to get the raw product data for the matching product
        let rawProduct: Product | null = null;
        try {
          rawProduct = await medusaApiClient.getProduct(matchingProduct.id);
        } catch (rawError) {
        }

        if (isMountedRef.current) {
          // Product data already contains inventory info from ProductDataMapper
          // No need to fetch from non-existent custom endpoint
          console.log('✅ [ProductDetailPage] Using inventory from product data:', {
            inStock: matchingProduct.inStock,
            inventory: matchingProduct.inventory
          });

          updateState({
            productData: matchingProduct,
            product: rawProduct,
            loading: false
          });

          console.log('✅ [ProductDetailPage] State updated');

          // Reset retry state on successful fetch
          reset();
          // Add to recently viewed
          addToRecentlyViewed(matchingProduct);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        const serviceError = err as ProductsServiceError;

        // If it's a 404 error, trigger Next.js 404 page
        if (serviceError.type === 'api' && serviceError.originalError &&
          'status' in serviceError.originalError && serviceError.originalError.status === 404) {
          notFound();
          return;
        }

        updateState({ error: serviceError, loading: false });
      }
    }
  }, [handle, updateState, reset]);

  // Retry handler using the retry hook
  const handleRetry = useCallback(async () => {
    if (!canRetry || !isMountedRef.current) return;

    try {
      await retry(fetchProductByHandle);
    } catch (err) {
      // Error is already handled in fetchProductByHandle
    }
  }, [retry, fetchProductByHandle, canRetry]);

  // Recently viewed products management
  const addToRecentlyViewed = useCallback((product: ProductCardData) => {
    const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    const filtered = recentlyViewed.filter((p: ProductCardData) => p.id !== product.id);
    const updated = [product, ...filtered].slice(0, 4); // Keep only 4 recent items
    localStorage.setItem('recentlyViewed', JSON.stringify(updated));
    updateState({ recentlyViewed: updated });
  }, [updateState]);

  // Quantity change handler
  const handleQuantityChange = useCallback((quantity: number) => {
    updateState({ selectedQuantity: quantity });
  }, [updateState]);

  // Image load handler
  const handleImageLoad = useCallback(() => {
    updateState({ imageLoaded: true });
  }, [updateState]);

  // Add to cart handler
  const handleAddToCart = useCallback(async () => {
    console.log('🛒 handleAddToCart called', {
      hasProductData: !!state.productData,
      hasProduct: !!state.product,
      inStock: state.productData?.inStock,
      variants: state.product?.variants?.length,
      hasAddToCart: !!addToCart
    });

    if (!addToCart) {
      console.log('❌ addToCart function not available from useCart');
      updateState({
        addToCartError: 'Cart is not ready. Please refresh the page.',
        addToCartSuccess: false
      });
      return;
    }

    if (!state.productData || !state.product) {
      console.log('❌ Missing product data or product');
      return;
    }

    // Check if product is in stock or available via backorder/unmanaged inventory
    console.log('📦 Stock check:', {
      inStock: state.productData.inStock,
      allowBackorder: state.productData.inventory?.allowBackorder
    });

    if (!state.productData.inStock) {
      // Allow proceeding if backorders are allowed or inventory is unmanaged (mapped as allowBackorder)
      const allowBackorder = state.productData.inventory?.allowBackorder;
      if (!allowBackorder) {
        console.log('❌ Product out of stock and no backorder');
        updateState({
          addToCartError: 'This product is currently out of stock.',
          addToCartSuccess: false
        });
        return;
      }
      console.log('✅ Product out of stock but backorder allowed');
    }

    // Check if product has variants
    console.log('🔍 Checking variants:', state.product.variants?.length);
    if (!state.product.variants || state.product.variants.length === 0) {
      console.log('❌ No variants available');
      updateState({
        addToCartError: 'This product has no available variants.',
        addToCartSuccess: false
      });
      return;
    }

    // Find the first available variant with stock/backorder/unmanaged
    let selectedVariant = null;
    console.log('🔎 Starting variant selection loop...');
    for (const variant of state.product.variants) {
      console.log('🔍 Checking variant:', {
        id: variant.id,
        inventory_quantity: variant.inventory_quantity,
        manage_inventory: variant.manage_inventory,
        allow_backorder: variant.allow_backorder,
        has_inventory_items: !!variant.inventory_items
      });

      // Check variant inventory
      let hasStock = false;

      // Check Medusa v1 style inventory
      if (typeof variant.inventory_quantity === 'number' && variant.inventory_quantity > 0) {
        hasStock = true;
        console.log('✅ Has stock via inventory_quantity:', variant.inventory_quantity);
      }
      // Check Medusa v2 style inventory
      else if (variant.inventory_items && variant.inventory_items.length > 0) {
        let availableQuantity = 0;
        for (const inventoryItem of variant.inventory_items) {
          const levels = inventoryItem.inventory?.location_levels || [];
          for (const level of levels) {
            availableQuantity += level?.available_quantity || 0;
          }
        }
        hasStock = availableQuantity >= state.selectedQuantity;
        console.log('📊 Inventory items check:', { availableQuantity, requiredQuantity: state.selectedQuantity, hasStock });
      }
      // If inventory is not managed, assume it's available
      else if (!variant.manage_inventory) {
        hasStock = true;
        console.log('✅ Unmanaged inventory - always available');
      }
      // Fallback: if manage_inventory is true but no inventory data provided,
      // trust the product-level inStock status from ProductDataMapper
      else if (variant.manage_inventory && state.productData.inStock) {
        hasStock = true;
        console.log('✅ Using product-level stock status (inventory data not in variant)');
      } else {
        console.log('⚠️ No inventory method matched');
      }

      // Allow selection when backorder is enabled even if no stock
      if (!hasStock && variant.allow_backorder) {
        hasStock = true;
        console.log('✅ No stock but backorder allowed');
      }

      if (hasStock) {
        selectedVariant = variant;
        console.log('✅ Selected variant:', variant.id);
        break;
      } else {
        console.log('❌ Variant rejected - no stock');
      }
    }

    if (!selectedVariant) {
      console.log('❌ No variant selected after loop');
      updateState({
        addToCartError: 'No product variant with sufficient stock is available.',
        addToCartSuccess: false
      });
      return;
    }

    console.log('🎯 Proceeding with selected variant:', selectedVariant.id);

    updateState({
      isAddingToCart: true,
      addToCartError: null,
      addToCartSuccess: false
    });

    try {
      // Extract price from the selected variant for cart limit validation
      let estimatedUnitPrice: number | undefined;
      if (selectedVariant.prices && selectedVariant.prices.length > 0) {
        estimatedUnitPrice = Number(selectedVariant.prices[0].amount || 0) / 100; // Convert from cents
      }

      console.log('🚀 Calling addToCart with:', {
        variantId: selectedVariant.id,
        quantity: state.selectedQuantity,
        estimatedUnitPrice
      });

      await addToCart(selectedVariant.id, state.selectedQuantity, estimatedUnitPrice);

      console.log('✅ addToCart completed successfully');

      // Show success feedback
      updateState({
        addToCartSuccess: true,
        addToCartError: null
      });

      // Clear success message after 3 seconds
      setTimeout(() => {
        updateState({ addToCartSuccess: false });
      }, 3000);

    } catch (error) {
      console.log('❌ addToCart failed:', error);

      // Handle specific error types
      let errorMessage = 'Failed to add item to cart. Please try again.';

      if (error instanceof Error) {
        if (error.message.includes('insufficient stock') || error.message.includes('out of stock')) {
          errorMessage = 'This item is currently out of stock or has insufficient quantity available.';
        } else if (error.message.includes('variant not found')) {
          errorMessage = 'This product variant is no longer available.';
        } else if (error.message.includes('cart not found')) {
          errorMessage = 'Your cart session has expired. Please refresh the page and try again.';
        } else {
          errorMessage = error.message;
        }
      }

      updateState({
        addToCartError: errorMessage,
        addToCartSuccess: false
      });

      // Clear error message after 5 seconds
      setTimeout(() => {
        updateState({ addToCartError: null });
      }, 5000);
    } finally {
      updateState({ isAddingToCart: false });
    }
  }, [state, addToCart, updateState]);

  // Image zoom handlers
  const handleImageMouseEnter = useCallback(() => {
    updateState({ showImageZoom: true });
  }, [updateState]);

  const handleImageMouseLeave = useCallback(() => {
    updateState({ showImageZoom: false });
  }, [updateState]);



  // Error boundary error handler
  const handleErrorBoundaryError = useCallback((error: Error, errorInfo: any) => {
  }, []);

  // Effect to resolve params
  useEffect(() => {
    params.then(resolvedParams => {
      const { handle: resolvedHandle } = resolvedParams;

      // Validate handle format
      if (!isValidHandle(resolvedHandle)) {
        notFound();
        return;
      }

      setHandle(resolvedHandle);
    });
  }, [params]);

  // Effect to fetch product on component mount and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    if (handle) {
      fetchProductByHandle();
    }

    // Load recently viewed from localStorage
    const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    updateState({ recentlyViewed });

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchProductByHandle, handle, updateState]);

  // Early return if handle is not yet resolved
  if (!handle) {
    return (
      <div className={styles.pageWrapper}>
        <div className={styles.layoutContainer}>
          <div className={styles.mainSection}>
            <div className={styles.contentInner}>
              <div className={styles.loadingContainer}>
                <div className={styles.loadingTitle}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (state.loading || isRetrying) {
    return (
      <div className={styles.pageWrapper}>
        <div className={styles.layoutContainer}>
          <div className={styles.mainSection}>
            <div className={styles.contentInner}>
              <div className={styles.loadingContainer}>
                <div className={styles.loadingTitle}></div>
                <div className={styles.loadingGrid}>
                  <div className={styles.loadingImage}></div>
                  <div className={styles.loadingInfo}>
                    <div className={styles.loadingBarLg}></div>
                    <div className={styles.loadingBarMd}></div>
                    <div className={styles.loadingBarXl}></div>
                    <div className={styles.loadingBarBtn}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className={styles.pageWrapper}>
        <div className={styles.layoutContainer}>
          <div className={styles.mainSection}>
            <div className={styles.contentInner}>
              <div className={styles.errorStateContainer}>
                <h1 className={styles.errorTitle}>
                  Error Loading Product
                </h1>
                <p className={styles.errorMessage}>
                  {state.error.message}
                </p>
                {canRetry && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRetry();
                    }}
                    className={styles.retryButton}
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      Try Again {retryCount > 0 && `(${retryCount}/${3})`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Product not found (this shouldn't happen as we call notFound() above)
  if (!state.productData) {
    notFound();
    return null;
  }

  // Estimated price defined here since used below
  const estimatedPrice = state.productData.price?.toLocaleString();

  const product = state.productData;

  console.log('🎨 [ProductDetailPage RENDER] Current product state:', {
    id: product?.id,
    title: product?.title,
    inStock: product?.inStock,
    inventory: product?.inventory
  });

  return (
    <div
      className={styles.pageWrapper}
    >
      <div className={styles.layoutContainer}>
        <NetworkStatus />

        <div className={styles.mainSection}>
          <div className={styles.contentInner}>
            {/* Breadcrumb */}
            <nav className={styles.breadcrumbNav}>
              <ol className={styles.breadcrumbList}>
                <li>
                  <a href="/" className={styles.breadcrumbLink}>
                    Home
                  </a>
                </li>
                <li className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={`${styles.iconSm} ${styles.breadcrumbSeparator}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <a href="/products" className={styles.breadcrumbLink}>
                    Products
                  </a>
                </li>
                <li className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={`${styles.iconSm} ${styles.breadcrumbSeparator}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <span className={styles.breadcrumbCurrent}>{product.title}</span>
                </li>
              </ol>
            </nav>

            {/* Product Detail Content */}
            <ErrorBoundary onError={handleErrorBoundaryError}>
              <div className={styles.productWrapper}>
                <div className={styles.productGrid}>
                  {/* Product Image */}
                  <div className={`${styles.imageWrapper} ${styles.imageContainerBorder} group`}>
                    {!state.imageLoaded && (
                      <div className={styles.loaderWrapper}>
                        <div className={styles.spinner}></div>
                      </div>
                    )}
                    <img
                      src={product.backgroundImage}
                      alt={product.title}
                      className={`${styles.productImage} ${state.imageLoaded ? styles.loaded : ''} ${state.showImageZoom ? styles.zoomActive : styles.zoomInactive}`}
                      onLoad={handleImageLoad}
                      onMouseEnter={handleImageMouseEnter}
                      onMouseLeave={handleImageMouseLeave}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/images/placeholder-product.svg';
                        handleImageLoad();
                      }}
                    />
                    {/* Image overlay for zoom effect */}
                    <div className={styles.imageOverlay}></div>
                    {/* Add subtle padding around image to prevent edge clipping when contain */}
                    <div className={styles.imagePaddingLayer}></div>

                    {/* Zoom indicator */}
                    {state.showImageZoom && (
                      <div className={styles.zoomIndicator}>
                        <svg className={styles.iconSm} style={{ color: '#141414' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Product Information */}
                  <div className={styles.productInfoColumn}>
                    {/* Title and Price */}
                    <div className={styles.titleGroup}>
                      <h1 className={styles.productTitle}>
                        {product.title}
                      </h1>
                      {product.subtitle && (
                        <p className={styles.productSubtitle}>
                          {product.subtitle}
                        </p>
                      )}

                    </div>
                    {/* Price visually separated lower, creating a tighter title/subtitle pair */}
                    <div className={styles.priceGroup}>
                      <span className={styles.currentPrice}>
                        {(product.currency && product.price !== undefined) ?
                          `${product.currency} ${product.price.toLocaleString()}` :
                          'Price not available'
                        }
                      </span>
                      {product.originalPrice && product.originalPrice > (product.price || 0) && (
                        <>
                          <span className={styles.originalPrice}>
                            {product.currency} {product.originalPrice.toLocaleString()}
                          </span>
                          <span className={styles.discountBadge}>
                            {(Math.round(((product.originalPrice - (product.price || 0)) / product.originalPrice) * 100))}% OFF
                          </span>
                        </>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className={styles.productDetails}>
                      <div className={styles.detailsContainer}>
                        {product.material && (
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Material</span>
                            <span className={styles.detailValue}>{product.material}</span>
                          </div>
                        )}

                        {product.dimensions && (
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Dimensions</span>
                            <span className={styles.detailValue}>{product.dimensions}</span>
                          </div>
                        )}

                        {product.weight && (
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Weight</span>
                            <span className={styles.detailValue}>
                              {product.weight} {product.weightUnit || 'g'}
                            </span>
                          </div>
                        )}

                        {/* Stock Status */}
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Availability</span>
                          <div className={styles.stockContainer}>
                            <div className={`${styles.stockIndicator} ${product.inStock ? styles.inStock : styles.outOfStock}`}></div>
                            <span className={`${styles.stockText} ${product.inStock ? styles.inStock : styles.outOfStock}`}>
                              {product.inStock ? 'In Stock' : 'Out of Stock'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {product.description && (
                      <DescriptionWithExpand text={product.description} />
                    )}

                    {/* Reviews next to description */}


                    {/* Spacer for sticky bar */}
                    <div className={styles.mobileSpacer}></div>

                    {/* Add to Cart Section */}
                    <div className={styles.mobileStickyBottom}>
                      <div className={styles.quantityGroup}>
                        <label htmlFor="quantity" className={styles.quantityLabel}>
                          Quantity
                        </label>
                        <div className={styles.quantitySelector}>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleQuantityChange(Math.max(1, state.selectedQuantity - 1));
                            }}
                            className={styles.quantityBtn}
                            disabled={state.selectedQuantity <= 1}
                          >
                            <svg className={styles.iconSm} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <span className={styles.quantityValue}>
                            {state.selectedQuantity}
                          </span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleQuantityChange(Math.min(10, state.selectedQuantity + 1));
                            }}
                            className={styles.quantityBtn}
                            disabled={state.selectedQuantity >= 10}
                          >
                            <svg className={styles.iconSm} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Shipping info */}
                      <span className={styles.shippingText}>Free shipping on orders over $50</span>

                      <div className={styles.actionBtnGroup}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddToCart();
                          }}
                          className={`${styles.addToCartBtn} ${product.inStock && !state.isAddingToCart && !cartLoading ? styles.btnPrimary : styles.btnDisabled}`}
                          disabled={!product.inStock || state.isAddingToCart || cartLoading}
                        >
                          {(state.isAddingToCart || cartLoading) ? (
                            <>
                              <LoadingSpinner size="small" color="white" />
                              <span>Adding...</span>
                            </>
                          ) : !product.inStock ? (
                            'Out of Stock'
                          ) : (
                            <>
                              <svg className={styles.iconSm} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 11-4 0v-6m4 0V9a2 2 0 10-4 0v4.01" />
                              </svg>
                              <span>
                                Add to Cart
                              </span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className={styles.wishlistBtn}
                          aria-label="Add to wishlist"
                          onClick={(e) => {
                            e.preventDefault();
                            // Placeholder for wishlist logic
                            console.log('Wishlist clicked');
                          }}
                        >
                          <svg className={styles.iconMd} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <ReviewsSection productId={state.product?.id || ''} />
                <SimilarProductsSection current={product} />
                {/* Reviews moved up */}

              </div>
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Footer Mock */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLinks}>
            <a href="#" className={styles.footerLink}>About Us</a>
            <a href="#" className={styles.footerLink}>Contact</a>
            <a href="#" className={styles.footerLink}>Terms of Service</a>
            <a href="#" className={styles.footerLink}>Privacy Policy</a>
          </div>
          <p className={styles.footerCopyright}>© 2024 Shila Murthi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
