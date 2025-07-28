'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from '../../components/Header';
import ProductsGrid from '../../components/ProductsGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../services/productsService';
import { ProductCardData } from '../../utils/productDataMapper';
import { useRetry } from '../../hooks/useRetry';
import styles from './productsPage.module.css';

// Memoized state interface to prevent unnecessary re-renders
interface ProductsState {
  products: ProductCardData[];
  loading: boolean;
  error: ProductsServiceError | null;
}

export default function ProductsPage() {
  // Use a single state object to minimize state updates
  const [state, setState] = useState<ProductsState>({
    products: [],
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
  const updateState = useCallback((updates: Partial<ProductsState>) => {
    if (!isMountedRef.current) return;
    
    setState(prevState => {
      // Only update if there are actual changes
      const newState = { ...prevState, ...updates };
      
      // Shallow comparison to prevent unnecessary updates
      if (
        newState.loading === prevState.loading &&
        newState.error === prevState.error &&
        newState.products === prevState.products
      ) {
        return prevState;
      }
      
      return newState;
    });
  }, []);

  // Fetch products with enhanced error handling and optimized state management
  const fetchProducts = useCallback(async () => {
    try {
      updateState({ loading: true, error: null });
      
      const fetchedProducts = await productsService.fetchProducts();
      
      if (isMountedRef.current) {
        updateState({ products: fetchedProducts, loading: false });
        // Reset retry state on successful fetch
        reset();
      }
    } catch (err) {
      if (isMountedRef.current) {
        const serviceError = err as ProductsServiceError;
        updateState({ error: serviceError, loading: false });
        console.error('Failed to fetch products:', serviceError);
      }
    }
  }, [updateState, reset]);

  // Effect to fetch products on component mount and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    fetchProducts();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchProducts]);

  // Retry handler using the retry hook
  const handleRetry = useCallback(async () => {
    if (!canRetry || !isMountedRef.current) return;
    
    try {
      await retry(fetchProducts);
    } catch (err) {
      // Error is already handled in fetchProducts
      console.error('Retry failed:', err);
    }
  }, [retry, fetchProducts, canRetry]);

  // Error boundary error handler - memoized to prevent re-renders
  const handleErrorBoundaryError = useCallback((error: Error, errorInfo: any) => {
    console.error('ErrorBoundary caught an error in ProductsPage:', error, errorInfo);
    
    // You could send this to an error reporting service
    // errorReportingService.captureException(error, { extra: errorInfo });
  }, []);

  // Memoize computed values to prevent unnecessary re-renders
  const isLoading = useMemo(() => state.loading || isRetrying, [state.loading, isRetrying]);
  
  // Memoize grid props to prevent unnecessary re-renders of ProductsGrid
  const gridProps = useMemo(() => ({
    products: state.products,
    loading: isLoading,
    error: state.error,
    onRetry: handleRetry,
    retryCount,
    maxRetries: 3,
    skeletonCount: 6
  }), [state.products, isLoading, state.error, handleRetry, retryCount]);

  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header />

        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
            <p className="py-8 text-[#141414] tracking-light text-[32px] font-bold leading-tight">Stone Idols</p>
            <div className="flex flex-col gap-6">
              <div className="flex gap-3 flex-wrap">
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Deities</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Animals</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Abstract</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Marble</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Granite</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
              </div>
            </div>
            <div className="@container">
              <div className="relative flex w-full flex-col items-start justify-between gap-3 p-4 @[480px]:flex-row">
                <p className="text-[#141414] text-base font-medium leading-normal w-full shrink-[3]">Price Range</p>
                <div className="flex h-[38px] w-full pt-1.5">
                  <div className="flex h-1 w-full rounded-sm bg-[#e0e0e0] pl-[60%] pr-[15%]">
                    <div className="relative">
                      <div className="absolute -left-3 -top-1.5 flex flex-col items-center gap-1">
                        <div className="size-4 rounded-full bg-[#141414]"></div>
                        <p className="text-[#141414] text-sm font-normal leading-normal">0</p>
                      </div>
                    </div>
                    <div className="h-1 flex-1 rounded-sm bg-[#141414]"></div>
                    <div className="relative">
                      <div className="absolute -left-3 -top-1.5 flex flex-col items-center gap-1">
                        <div className="size-4 rounded-full bg-[#141414]"></div>
                        <p className="text-[#141414] text-sm font-normal leading-normal">1000</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-3 flex-wrap pr-4">
              <button className="flex h-8 w-35 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-4 pr-2">
                <p className="text-[#141414] text-sm font-medium leading-normal">Sort by: Price</p>
                <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                  </svg>
                </div>
              </button>
            </div>
            
            {/* Products Grid with Enhanced Loading and Error States */}
            <ErrorBoundary onError={handleErrorBoundaryError}>
              <ProductsGrid {...gridProps} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
