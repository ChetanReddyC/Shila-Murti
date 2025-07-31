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

interface ProductDetailPageProps {
  params: { handle: string };
}

interface ProductDetailState {
  product: Product | null;
  productData: ProductCardData | null;
  loading: boolean;
  error: ProductsServiceError | null;
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { handle } = params;

  // Validate handle format
  if (!isValidHandle(handle)) {
    notFound();
    return null;
  }
  
  // Use a single state object to minimize state updates
  const [state, setState] = useState<ProductDetailState>({
    product: null,
    productData: null,
    loading: true,
    error: null
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
        newState.productData === prevState.productData
      ) {
        return prevState;
      }
      
      return newState;
    });
  }, []);

  // Fetch product by handle
  const fetchProductByHandle = useCallback(async () => {
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

  // Effect to fetch product on component mount and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    fetchProductByHandle();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchProductByHandle]);

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

  // Error boundary error handler
  const handleErrorBoundaryError = useCallback((error: Error, errorInfo: any) => {
    console.error('ErrorBoundary caught an error in ProductDetailPage:', error, errorInfo);
  }, []);

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
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        <Header />

        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
            {/* Breadcrumb */}
            <nav className="py-4">
              <ol className="flex items-center space-x-2 text-sm text-[#141414]">
                <li>
                  <a href="/" className="hover:text-[#333333] transition-colors">
                    Home
                  </a>
                </li>
                <li className="flex items-center">
                  <div className="text-[#141414] mx-2" data-icon="CaretRight" data-size="16px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <a href="/products" className="hover:text-[#333333] transition-colors">
                    Products
                  </a>
                </li>
                <li className="flex items-center">
                  <div className="text-[#141414] mx-2" data-icon="CaretRight" data-size="16px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                    </svg>
                  </div>
                  <span className="text-[#141414] font-medium">{product.title}</span>
                </li>
              </ol>
            </nav>

            {/* Product Detail Content */}
            <ErrorBoundary onError={handleErrorBoundaryError}>
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-4">
                  {/* Product Image */}
                  <div className="aspect-square relative overflow-hidden rounded-lg bg-[#f2f2f2]">
                    <img
                      src={product.foregroundImage}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/images/placeholder-product.svg';
                      }}
                    />
                  </div>

                  {/* Product Information */}
                  <div className="flex flex-col gap-6">
                    {/* Title and Price */}
                    <div className="flex flex-col gap-4">
                      <h1 className="text-[#141414] tracking-light text-[32px] font-bold leading-tight">
                        {product.title}
                      </h1>
                      {product.subtitle && (
                        <p className="text-[#141414] text-lg font-normal leading-normal">
                          {product.subtitle}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[#141414] text-2xl font-bold leading-tight">
                          {product.currency && product.price ? 
                            `${product.currency} ${product.price.toLocaleString()}` : 
                            'Price not available'
                          }
                        </span>
                        {product.originalPrice && product.originalPrice > (product.price || 0) && (
                          <span className="text-[#6b7280] text-lg font-normal leading-normal line-through">
                            {product.currency} {product.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product Details */}
                    <div className="flex flex-col gap-3">
                      {product.material && (
                        <div className="flex gap-2">
                          <span className="text-[#141414] text-sm font-medium leading-normal">Material:</span>
                          <span className="text-[#141414] text-sm font-normal leading-normal">{product.material}</span>
                        </div>
                      )}
                      
                      {product.dimensions && (
                        <div className="flex gap-2">
                          <span className="text-[#141414] text-sm font-medium leading-normal">Dimensions:</span>
                          <span className="text-[#141414] text-sm font-normal leading-normal">{product.dimensions}</span>
                        </div>
                      )}

                      {product.weight && (
                        <div className="flex gap-2">
                          <span className="text-[#141414] text-sm font-medium leading-normal">Weight:</span>
                          <span className="text-[#141414] text-sm font-normal leading-normal">
                            {product.weight} {product.weightUnit || 'g'}
                          </span>
                        </div>
                      )}

                      {/* Stock Status */}
                      <div className="flex gap-2">
                        <span className="text-[#141414] text-sm font-medium leading-normal">Availability:</span>
                        <span className={`text-sm font-normal leading-normal ${product.inStock ? 'text-green-600' : 'text-red-600'}`}>
                          {product.inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {product.description && (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-[#141414] text-base font-medium leading-normal">Description</h3>
                        <p className="text-[#141414] text-sm font-normal leading-normal">
                          {product.description}
                        </p>
                      </div>
                    )}

                    {/* Add to Cart Section */}
                    <div className="flex flex-col gap-4 pt-4 border-t border-[#e0e0e0]">
                      <div className="flex items-center gap-4">
                        <label htmlFor="quantity" className="text-[#141414] text-sm font-medium leading-normal">
                          Quantity:
                        </label>
                        <select
                          id="quantity"
                          className="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-4 pr-4 border-none focus:outline-none focus:ring-2 focus:ring-[#141414]"
                          defaultValue={1}
                        >
                          {[1, 2, 3, 4, 5].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        className={`flex h-12 w-full shrink-0 items-center justify-center rounded-xl font-medium transition-colors ${
                          product.inStock
                            ? 'bg-[#141414] text-white hover:bg-[#333333]'
                            : 'bg-[#e0e0e0] text-[#6b7280] cursor-not-allowed'
                        }`}
                        disabled={!product.inStock}
                      >
                        <span className="text-sm font-medium leading-normal">
                          {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}