'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { notFound } from 'next/navigation';
import Header from '../../../components/Header';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../../services/productsService';
import { ProductCardData } from '../../../utils/productDataMapper';
import { Product } from '../../../types/medusa';
import { useRetry } from '../../../hooks/useRetry';
import { isValidHandle, generateProductHandle } from '../../../utils/productHandleGenerator';
import styles from './ProductDetailPage.module.css'
import FeaturesSection from './FeaturesSection';
import ReviewsSection from './ReviewsSection';
import SimilarProductsSection from './SimilarProductsSection';

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
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  // All hooks must be at the top before any conditional logic
  const [handle, setHandle] = useState<string | null>(null);

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
    recentlyViewed: []
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
      updateState({ loading: true, error: null });

      try {
        // Try to use the new fetchProductByHandle method
        const productData = await productsService.fetchProductByHandle(handle);

        if (isMountedRef.current) {
          updateState({
            productData,
            loading: false
          });
          // Reset retry state on successful fetch
          reset();
          // Add to recently viewed
          addToRecentlyViewed(productData);
        }
      } catch (handleError) {
        // If handle-based fetch fails, fall back to searching all products
        console.log('Handle-based fetch failed, falling back to search:', handleError);

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

        if (isMountedRef.current) {
          updateState({
            productData: matchingProduct,
            loading: false
          });
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
        console.error('Failed to fetch product:', serviceError);
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
      console.error('Retry failed:', err);
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
    if (!state.productData || !state.productData.inStock) return;

    updateState({ isAddingToCart: true });

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));

      // Add to cart logic would go here
      console.log(`Added ${state.selectedQuantity} of ${state.productData.title} to cart`);

      // Show success feedback
      // You could add a toast notification here

    } catch (error) {
      console.error('Failed to add to cart:', error);
    } finally {
      updateState({ isAddingToCart: false });
    }
  }, [state.productData, state.selectedQuantity, updateState]);

  // Image zoom handlers
  const handleImageMouseEnter = useCallback(() => {
    updateState({ showImageZoom: true });
  }, [updateState]);

  const handleImageMouseLeave = useCallback(() => {
    updateState({ showImageZoom: false });
  }, [updateState]);

  // Error boundary error handler
  const handleErrorBoundaryError = useCallback((error: Error, errorInfo: any) => {
    console.error('ErrorBoundary caught an error in ProductDetailPage:', error, errorInfo);
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
      <div
        className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
        style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="px-40 flex flex-1 justify-center py-5">
            <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
              <div className="animate-pulse">
                <div className="h-8 bg-[#f2f2f2] rounded w-1/3 mb-6"></div>
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
      <div
        className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
        style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="px-40 flex flex-1 justify-center py-5">
            <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
              <div className="animate-pulse">
                <div className="h-8 bg-[#f2f2f2] rounded w-1/3 mb-6"></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="aspect-square bg-[#f2f2f2] rounded-lg"></div>
                  <div className="flex flex-col gap-4">
                    <div className="h-8 bg-[#f2f2f2] rounded w-3/4"></div>
                    <div className="h-6 bg-[#f2f2f2] rounded w-1/2"></div>
                    <div className="h-20 bg-[#f2f2f2] rounded"></div>
                    <div className="h-12 bg-[#f2f2f2] rounded w-full"></div>
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
      <div
        className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
        style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="px-40 flex flex-1 justify-center py-5">
            <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
              <div className="text-center py-12">
                <h1 className="text-[#141414] tracking-light text-[32px] font-bold leading-tight mb-4">
                  Error Loading Product
                </h1>
                <p className="text-[#141414] text-base font-normal leading-normal mb-6">
                  {state.error.message}
                </p>
                {canRetry && (
                  <button
                    onClick={handleRetry}
                    className="flex h-12 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#141414] text-white px-8 hover:bg-[#333333] transition-colors"
                  >
                    <span className="text-sm font-medium leading-normal">
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

  const product = state.productData;

  return (
    <div
      className={`relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden ${styles.pageContainer}`}
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        <Header />

        <div className="px-8 md:px-16 lg:px-24 xl:px-40 flex flex-1 justify-center py-12">
          <div className={`layout-content-container flex flex-col max-w-[1200px] flex-1 ${styles.contentWrapper}`}>
            {/* Breadcrumb */}
            <nav className="py-8 mb-4">
              <ol className="flex items-center space-x-3 text-sm text-[#6b7280]">
                <li>
                  <a href="/" className="hover:text-[#333333] transition-colors">
                    Home
                  </a>
                </li>
                <li className="flex items-center">
                  <div className="text-[#6b7280] mx-3" data-icon="CaretRight" data-size="16px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <a href="/products" className="hover:text-[#141414] transition-colors">
                    Products
                  </a>
                </li>
                <li className="flex items-center">
                  <div className="text-[#6b7280] mx-3" data-icon="CaretRight" data-size="16px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <span className="text-[#141414] font-semibold">{product.title}</span>
                </li>
              </ol>
            </nav>

            {/* Product Detail Content */}
            <ErrorBoundary onError={handleErrorBoundaryError}>
              <div className="flex flex-col">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 py-8">
                  {/* Product Image */}
                  <div className={`aspect-square relative overflow-hidden rounded-lg bg-[#f2f2f2] group ${styles.imageContainerBorder}`}>
                    {!state.imageLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#141414]"></div>
                      </div>
                    )}
                    <img
                      src={product.backgroundImage}
                      alt={product.title}
                      className={`w-full h-full object-contain transition-all duration-300 ${state.imageLoaded ? 'opacity-100' : 'opacity-0'
                        } ${state.showImageZoom ? 'scale-165' : 'scale-150'}`}
                      style={{ imageRendering: 'auto' }}
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
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none"></div>
                    {/* Add subtle padding around image to prevent edge clipping when contain */}
                    <div className="pointer-events-none absolute inset-0 p-2 md:p-3 lg:p-4"></div>

                    {/* Zoom indicator */}
                    {state.showImageZoom && (
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
                        <svg className="w-4 h-4 text-[#141414]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Product Information */}
                  <div className="flex flex-col gap-10">
                    {/* Title and Price */}
                    <div className="flex flex-col gap-6">
                      <h1 className="text-[#141414] tracking-tight text-4xl lg:text-5xl font-bold leading-tight">
                        {product.title}
                      </h1>
                      {product.subtitle && (
                        <p className="text-[#6b7280] text-xl font-normal leading-relaxed">
                          {product.subtitle}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-[#141414] text-3xl lg:text-4xl font-bold leading-tight">
                          {product.currency && product.price ?
                            `${product.currency} ${product.price.toLocaleString()}` :
                            'Price not available'
                          }
                        </span>
                        {product.originalPrice && product.originalPrice > (product.price || 0) && (
                          <>
                            <span className="text-[#6b7280] text-xl font-normal leading-normal line-through">
                              {product.currency} {product.originalPrice.toLocaleString()}
                            </span>
                            <span className="bg-red-100 text-red-800 text-sm font-semibold px-3 py-1 rounded-full">
                              {Math.round(((product.originalPrice - (product.price || 0)) / product.originalPrice) * 100)}% OFF
                            </span>
                          </>
                        )}
                      </div>
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
                      <div className="flex flex-col gap-4">
                        <h3 className="text-[#141414] text-xl font-semibold leading-tight">Description</h3>
                        <p className="text-[#6b7280] text-base font-normal leading-relaxed">
                          {product.description}
                        </p>
                      </div>
                    )}

                    {/* Add to Cart Section */}
                    <div className="flex flex-col gap-8 pt-8 border-t-2 border-[#e0e0e0]">
                      <div className="flex items-center gap-6">
                        <label htmlFor="quantity" className="text-[#141414] text-lg font-semibold">
                          Quantity
                        </label>
                        <div className="flex items-center border-2 border-[#e0e0e0] rounded-2xl overflow-hidden bg-white shadow-sm">
                          <button
                            onClick={() => handleQuantityChange(Math.max(1, state.selectedQuantity - 1))}
                            className="px-4 py-3 hover:bg-[#f2f2f2] transition-colors disabled:opacity-50"
                            disabled={state.selectedQuantity <= 1}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="px-6 py-3 min-w-[4rem] text-center text-lg font-semibold">
                            {state.selectedQuantity}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(Math.min(10, state.selectedQuantity + 1))}
                            className="px-4 py-3 hover:bg-[#f2f2f2] transition-colors disabled:opacity-50"
                            disabled={state.selectedQuantity >= 10}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                      </div>

                       {/* Shipping info */}
                        <span className="font-medium text-[#6b7280]">Free shipping on orders over $50</span>

                      <div className="flex gap-4">
                        <button
                          onClick={handleAddToCart}
                          className={`flex h-16 flex-1 shrink-0 items-center justify-center rounded-2xl font-semibold text-lg transition-all duration-200 ${product.inStock && !state.isAddingToCart
                              ? 'bg-[#141414] text-white hover:bg-[#333333] hover:shadow-xl transform hover:-translate-y-1 shadow-lg'
                              : 'bg-[#e0e0e0] text-[#6b7280] cursor-not-allowed'
                            }`}
                          disabled={!product.inStock || state.isAddingToCart}
                        >
                          {state.isAddingToCart ? (
                            <div className="flex items-center gap-3">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              <span className="text-lg font-semibold">Adding...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 11-4 0v-6m4 0V9a2 2 0 10-4 0v4.01" />
                              </svg>
                              <span className="text-lg font-semibold">
                                {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                              </span>
                            </div>
                          )}
                        </button>

                        {/* Wishlist button */}
                        <button
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#e0e0e0] hover:bg-[#f2f2f2] hover:border-[#141414] transition-all duration-200 shadow-sm hover:shadow-md"
                          title="Add to Wishlist"
                        >
                          <svg className="w-6 h-6 text-[#141414]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Recently Viewed Section */}
                {state.recentlyViewed.length > 1 && (
                  <div className="mt-20 pt-12 border-t-2 border-[#e0e0e0]">
                    <h3 className="text-[#141414] text-2xl lg:text-3xl font-bold leading-tight mb-10">
                      Recently Viewed
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                      {state.recentlyViewed
                        .filter(item => item.id !== product.id)
                        .slice(0, 3)
                        .map((item) => (
                          <a
                            key={item.id}
                            href={`/products/${generateProductHandle(item.title)}`}
                            className="group block"
                          >
                            <div className="aspect-square relative overflow-hidden rounded-2xl bg-[#f2f2f2] mb-4 shadow-sm group-hover:shadow-lg transition-all duration-300">
                              <img
                                src={item.foregroundImage}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = '/images/placeholder-product.svg';
                                }}
                              />
                            </div>
                            <h4 className="text-[#141414] text-base font-semibold leading-tight truncate group-hover:text-[#333333] transition-colors mb-2">
                              {item.title}
                            </h4>
                            <p className="text-[#141414] text-lg font-bold leading-tight">
                              {item.currency && item.price ?
                                `${item.currency} ${item.price.toLocaleString()}` :
                                'Price not available'
                              }
                            </p>
                          </a>
                        ))}
                    </div>
                  </div>
                )}

                {/* Product Features */}
                <div className={`mt-16 pt-12 border-[#e0e0e0] ${styles.lastSection}`}>
                  <FeaturesSection />
                </div>

                {/* Reviews - increase separation from the ridged section above */}
                <div className="mt-32 md:mt-48 lg:mt-56 xl:mt-64">
                  <ReviewsSection />
                </div>

                {/* Similar Products */}
                <div className="mt-16">
                  <SimilarProductsSection current={product} />
                </div>

                {/* Footer */}
                <footer className={styles.footer}>
                  <div className={styles.footerLinks}>
                    {[
                      { label: "About Us", href: "/about" },
                      { label: "Contact", href: "/contact" },
                      { label: "Terms of Service", href: "/terms" },
                    ].map((link) => (
                      <a
                        key={link.label}
                        className={styles.footerLink}
                        href={link.href}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <p className={styles.footerCopyright}>
                    © 2024 Shila Murthi. All rights reserved.
                  </p>
                </footer>
              </div>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
