'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from '../../components/Header';
import ProductsGrid from '../../components/ProductsGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../services/productsService';
import { ProductCardData } from '../../utils/productDataMapper';
import { useRetry } from '../../hooks/useRetry';
import { debugMedusaApiResponse } from '../../utils/debugApiResponse';
import styles from './productsPage.module.css';
import { UiCategoryKey, resolveCategoryIdsByUiKeys } from '../../config/categoryMapping';
import { medusaApiClient } from '../../utils/medusaApiClient';

// Memoized state interface to prevent unnecessary re-renders
interface ProductsState {
  products: ProductCardData[];
  loading: boolean;
  error: ProductsServiceError | null;
}

type SortOption = 'price-asc' | 'price-desc';

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

    // Parse URL for initial sort and categories
    let shouldFetchAll = true;
    try {
      const url = new URL(window.location.href);
      const sort = url.searchParams.get('sort');
      if (sort === 'price-asc' || sort === 'price-desc') {
        setSortOption(sort);
      }

      const categoriesParam = url.searchParams.get('categories');
      if (categoriesParam) {
        const keys = categoriesParam
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0) as UiCategoryKey[];
        if (keys.length > 0) {
          setSelectedCategories(new Set(keys));
          shouldFetchAll = false; // category effect will handle fetching
        }
      } else {
        // If no categories in URL, ensure our preselected defaults are applied
        setSelectedCategories(new Set(preselectedCategoryKeys));
      }
    } catch {
      // ignore
    }

    if (shouldFetchAll) {
    fetchProducts();
    }
    
    // Make debug function available in browser console
    if (typeof window !== 'undefined') {
      (window as any).debugMedusaApi = debugMedusaApiResponse;
      console.log('🔧 Debug functions: window.debugMedusaApi(), window.debugCategoryFilterStatus()');
      
      // Also make shader test available
      import('../../utils/testShaderCompilation').then(({ testShaderCompilation }) => {
        (window as any).testShaderCompilation = testShaderCompilation;
        console.log('🔧 Shader test function available: window.testShaderCompilation()');
      });
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchProducts]);

  // (moved below category state to satisfy linter)

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
  
  // Sort state and derived sorted products
  const [sortOpen, setSortOpen] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<SortOption>('price-asc');
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [highlightStyle, setHighlightStyle] = useState<{ transform: string; height: number; opacity: number }>({ transform: 'translateY(0px)', height: 0, opacity: 0 });
  const [moreOpen, setMoreOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Default preselected categories (when URL has none)
  const preselectedCategoryKeys: UiCategoryKey[] = ['deities', 'marble'];
  const toLabel = (handle: string) => handle.length ? handle.charAt(0).toUpperCase() + handle.slice(1) : handle;
  type CategoryItem = { id: string; handle: string; name?: string | null };
  const [allCategories, setAllCategories] = useState<CategoryItem[]>([]);
  // No mockup/default pills; we show only selected categories and the More/Clear actions

  // Load categories from Medusa Admin (Store API) so new categories appear automatically
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await medusaApiClient.getProductCategories({ limit: 200 });
        const list: CategoryItem[] = (res.product_categories || []).map((c: any) => ({
          id: c.id,
          handle: c.handle || '',
          name: c.name || '',
        }));
        if (!cancelled) setAllCategories(list);
      } catch (e) {
        console.warn('[ProductsPage] Failed to fetch categories list', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Category selection state (task 2)
  const [selectedCategories, setSelectedCategories] = useState<Set<UiCategoryKey>>(new Set(preselectedCategoryKeys));
  const [pendingFetch, setPendingFetch] = useState<boolean>(false);
  const debounceRef = useRef<number | null>(null);
  const fetchVersionRef = useRef<number>(0);
  const [lastCategoryFetchMs, setLastCategoryFetchMs] = useState<number | null>(null);
  const [lastResolvedCategoryIds, setLastResolvedCategoryIds] = useState<string[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        // Defer closing slightly to allow any ongoing highlight animation to finish
        requestAnimationFrame(() => setTimeout(() => setSortOpen(false), 50));
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Animate moving highlight to the selected option
  useEffect(() => {
    if (!sortOpen) {
      setHighlightStyle(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const menu = sortMenuRef.current;
    if (!menu) return;
    // Match DOM order of options
    const optionKeys: SortOption[] = ['price-asc', 'price-desc'];
    const index = optionKeys.indexOf(sortOption);
    const rows = menu.querySelectorAll(':scope > li');
    const target = rows[index] as HTMLElement | undefined;
    if (!target) return;

    // Use offsetTop/offsetHeight relative to the UL (which is positioned),
    // avoiding transform measurement issues and padding math.
    const offsetY = target.offsetTop;
    const height = target.offsetHeight;

    setHighlightStyle({ transform: `translateY(${offsetY}px)`, height, opacity: 1 });
  }, [sortOpen, sortOption]);

  // Debounced fetch when selected categories change
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    // Debounce ~200ms
    debounceRef.current = window.setTimeout(async () => {
      try {
        setPendingFetch(true);
        if (process.env.NODE_ENV !== 'production') {
          console.log('[ProductsPage] Selected categories:', Array.from(selectedCategories.values()));
        }
        const t0 = performance.now();
        const version = ++fetchVersionRef.current;
        const ids = await resolveCategoryIdsByUiKeys(selectedCategories, medusaApiClient);
        setLastResolvedCategoryIds(ids);
        // If no categories selected, fetch all as before
        if (ids.length === 0) {
          await fetchProducts();
        } else {
          updateState({ loading: true, error: null });
          const fetchedProducts = await productsService.fetchProducts({ category_id: ids });
          // Only apply if this is the latest fetch to avoid race conditions
          if (isMountedRef.current && version === fetchVersionRef.current) {
            updateState({ products: fetchedProducts, loading: false });
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          const t1 = performance.now();
          const took = Math.round(t1 - t0);
          setLastCategoryFetchMs(took);
          console.log('[ProductsPage] Category fetch completed in', took, 'ms');
        }
      } catch (err) {
        if (isMountedRef.current) {
          const serviceError = err as ProductsServiceError;
          updateState({ error: serviceError, loading: false });
          console.error('Failed to fetch products by categories:', serviceError);
        }
      } finally {
        setPendingFetch(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [selectedCategories, fetchProducts, updateState]);

  const toggleCategory = useCallback((key: UiCategoryKey) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Keep debugCategoryFilterStatus in sync with state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugCategoryFilterStatus = () => ({
        selectedCategories: Array.from(selectedCategories.values()),
        loading: pendingFetch,
        lastCategoryFetchMs,
      });
    }
  }, [selectedCategories, pendingFetch, lastCategoryFetchMs]);

  const clearCategories = useCallback(() => {
    setSelectedCategories(new Set());
  }, []);

  // No suggestion removal needed since we do not render mockup pills anymore

  const sortLabel = useMemo(() => {
    switch (sortOption) {
      case 'price-asc':
        return 'Price: Low to High';
      case 'price-desc':
        return 'Price: High to Low';
      default:
        return 'Price';
    }
  }, [sortOption]);

  // Optional URL sync for categories and sort
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      // sort
      url.searchParams.set('sort', sortOption);
      // categories by handle (use label keys)
      const handles = Array.from(selectedCategories.values());
      if (handles.length > 0) url.searchParams.set('categories', handles.join(','));
      else url.searchParams.delete('categories');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore URL errors in non-browser environments
    }
  }, [selectedCategories, sortOption]);

  const sortedProducts = useMemo(() => {
    const annotated = state.products.map((product, index) => ({ product, index }));

    annotated.sort((a, b) => {
      const aVal = a.product.price == null ? (sortOption === 'price-desc' ? -Infinity : Infinity) : a.product.price;
      const bVal = b.product.price == null ? (sortOption === 'price-desc' ? -Infinity : Infinity) : b.product.price;
      const primary = sortOption === 'price-asc' ? aVal - bVal : bVal - aVal;
      if (primary !== 0) return primary;
      // Stable tiebreaker
      return a.index - b.index;
    });

    return annotated.map(x => x.product);
  }, [state.products, sortOption]);
  
  // Memoize grid props to prevent unnecessary re-renders of ProductsGrid
  const gridProps = useMemo(() => ({
    products: sortedProducts,
    loading: isLoading,
    error: state.error,
    onRetry: handleRetry,
    retryCount,
    maxRetries: 3,
    skeletonCount: 6
  }), [sortedProducts, isLoading, state.error, handleRetry, retryCount]);

  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      {/* Live region for screen readers to announce product count changes */}
      <div aria-live="polite" className={styles.srOnly}>
        {sortedProducts.length} products loaded
      </div>
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header />

        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
            <p className="py-8 text-[#141414] tracking-light text-[32px] font-bold leading-tight">Stone Idols</p>
            <div className="flex flex-col gap-6 items-start">
              <div className={styles.pillContainer}>
              <div className={styles.pillGrid}>
                {/* Selected categories appear as pills */}
                {Array.from(selectedCategories).map((key) => {
                  const label = toLabel(String(key));
                  return (
                    <button
                      key={String(key)}
                      type="button"
                      onClick={() => toggleCategory(key)}
                      className={styles.pillFilterButton}
                      aria-pressed={selectedCategories.has(key)}
                      aria-label={`Toggle ${label} category`}
                    >
                      <span className={styles.pillFilterLabel}>{label}</span>
                      <svg
                        className={styles.pillClose}
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 256 256"
                        aria-hidden="true"
                        onClick={(e) => { e.stopPropagation(); toggleCategory(key); }}
                      >
                        <path fill="currentColor" d="M200.49,55.51a12,12,0,0,0-17,0L128,111,72.49,55.51a12,12,0,0,0-17,17L111,128,55.51,183.51a12,12,0,1,0,17,17L128,145l55.51,55.51a12,12,0,0,0,17-17L145,128l55.51-55.51A12,12,0,0,0,200.49,55.51Z"/>
                      </svg>
                    </button>
                  );
                })}
                {/* More button */}
                <div className={styles.moreMenuWrapper} ref={moreMenuRef}>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(o => !o)}
                    className={styles.pillFilterButton}
                    aria-expanded={moreOpen}
                    aria-haspopup="listbox"
                  >
                    <span className={styles.pillFilterLabel}>More</span>
                  <svg className={styles.pillChevron} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" aria-hidden="true">
                    <path fill="currentColor" d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                  </svg>
                </button>
                  {moreOpen && (
                    <ul className={styles.moreMenu} role="listbox">
                      {allCategories
                        .filter((c) => !selectedCategories.has(c.handle))
                        .map((c) => (
                        <li key={c.id} role="option" aria-selected={selectedCategories.has(c.handle)}>
                          <button
                            type="button"
                            className={styles.moreMenuItem}
                            onClick={() => toggleCategory(c.handle)}
                          >
                            <span className={styles.pillFilterLabel}>{c.name || toLabel(c.handle)}</span>
                            {selectedCategories.has(c.handle) ? (
                              <svg className={styles.pillClose} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
                                <path fill="currentColor" d="M200.49,55.51a12,12,0,0,0-17,0L128,111,72.49,55.51a12,12,0,0,0-17,17L111,128,55.51,183.51a12,12,0,1,0,17,17L128,145l55.51,55.51a12,12,0,0,0,17-17L145,128l55.51-55.51A12,12,0,0,0,200.49,55.51Z"/>
                  </svg>
                            ) : null}
                </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
                {/* Clear button follows immediately after More */}
                <button
                  type="button"
                  onClick={clearCategories}
                  className={`${styles.pillFilterButton} ${styles.pillClearButton}`}
                  aria-label="Clear category filters"
                >
                  <span className={styles.pillFilterLabel}>Clear</span>
                </button>
              </div>
              {/* Removed missing category notice per updated design */}
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
              <div className={styles.sortWrapper} ref={sortMenuRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen(o => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                  aria-controls="sort-menu"
                  className={`${styles.pillFilterButton} ${styles.sortButton}`}
                >
                  <p className="text-[#141414] text-sm font-medium leading-normal">Sort by: {sortLabel}</p>
                  <div className={styles.pillChevron} data-icon="CaretDown" data-size="18px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                  </svg>
                </div>
              </button>

                <ul
                  id="sort-menu"
                  role="listbox"
                  className={`${styles.sortMenu} ${sortOpen ? styles.sortMenuOpen : ''}`}
                >
                    <div
                      ref={highlightRef}
                      className={styles.sortMenuHighlight}
                      style={{ transform: highlightStyle.transform, height: highlightStyle.height, opacity: highlightStyle.opacity }}
                      aria-hidden="true"
                    />
                    <li role="option" aria-selected={sortOption === 'price-asc'} style={{ listStyle: 'none' }}>
                      <button
                        type="button"
                        onClick={() => { setSortOption('price-asc'); }}
                        className={`${styles.sortMenuItem} ${sortOption === 'price-asc' ? styles.sortMenuItemActive : ''}`}
                      >
                        Price: Low to High
                      </button>
                    </li>
                    <li role="option" aria-selected={sortOption === 'price-desc'} style={{ listStyle: 'none' }}>
                      <button
                        type="button"
                        onClick={() => { setSortOption('price-desc'); }}
                        className={`${styles.sortMenuItem} ${sortOption === 'price-desc' ? styles.sortMenuItemActive : ''}`}
                      >
                        Price: High to Low
                      </button>
                    </li>
                
                </ul>
              </div>
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
