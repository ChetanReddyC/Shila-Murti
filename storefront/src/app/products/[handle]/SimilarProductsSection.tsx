'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import ProductCardWithShader from '../../../components/ProductCardWithShader/ProductCardWithShader';
import HoverEffectOverlay, { HoverOverlayAPI } from '../../../components/HoverEffectOverlay/HoverEffectOverlay';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../../services/productsService';
import { ProductCardData } from '../../../utils/productDataMapper';
import { generateProductHandle } from '../../../utils/productHandleGenerator';
import styles from './SimilarProductsSection.module.css';

interface SimilarProductsSectionProps {
  current: ProductCardData;
  limit?: number;
}

interface SectionState {
  loading: boolean;
  error: ProductsServiceError | null;
  products: ProductCardData[];
}

function tokenize(text?: string | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreSimilarity(a: ProductCardData, b: ProductCardData): number {
  const aTokens = new Set([...tokenize(a.title), ...tokenize(a.subtitle)]);
  const bTokens = new Set([...tokenize(b.title), ...tokenize(b.subtitle)]);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersect = 0;
  bTokens.forEach((t) => {
    if (aTokens.has(t)) intersect += 1;
  });

  // Jaccard-like score biased a bit towards intersection size
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const jaccard = intersect / union;

  // Add slight weight for prefix/title word matches to improve "relevance"
  const aTitleFirst = tokenize(a.title)[0];
  const bTitleFirst = tokenize(b.title)[0];
  const titleBoost = aTitleFirst && bTitleFirst && aTitleFirst === bTitleFirst ? 0.25 : 0;

  return jaccard + titleBoost + Math.min(intersect * 0.03, 0.15);
}

const SimilarProductsSection: React.FC<SimilarProductsSectionProps> = ({ current, limit = 8 }) => {
  const [state, setState] = useState<SectionState>({
    loading: true,
    error: null,
    products: []
  });

  const isMountedRef = useRef(true);
  const overlayRef = useRef<HoverOverlayAPI | null>(null);

  const updateState = useCallback((updates: Partial<SectionState>) => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      updateState({ loading: true, error: null });
      const all = await productsService.fetchProducts();

      // Exclude current product by id (fallback to handle/title if id missing)
      const filtered = all.filter((p) => {
        if (current.id && p.id) return p.id !== current.id;
        return generateProductHandle(p.title) !== generateProductHandle(current.title);
      });

      // Score and sort
      const scored = filtered
        .map((p) => ({ p, s: scoreSimilarity(current, p) }))
        .filter((x) => x.s > 0) // must have at least some relevance
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.p);

      updateState({ products: scored, loading: false });
    } catch (err) {
      updateState({ error: err as ProductsServiceError, loading: false });
    }
  }, [current, limit, updateState]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchAll();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchAll]);

  const hasProducts = state.products.length > 0;

  if (state.loading) {
    return (
      <section className={styles.section} aria-busy="true" aria-live="polite">
        <div className={styles.headerRow}>
          <h3 className={styles.title}>Similar Products</h3>
          <Link href="/products" className={styles.viewAll}>View all</Link>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: Math.min(limit, 8) }, (_, i) => (
            <div key={`sim-skel-${i}`} className={styles.cardWrapper}>
              {/* Reuse the skeleton look by minimal placeholder to avoid Tailwind, ProductCardSkeleton is used in grid; here keep light */}
              <div style={{
                aspectRatio: '1 / 1',
                width: '100%',
                borderRadius: '16px',
                background: '#f2f2f2'
              }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className={styles.section} aria-live="polite">
        <div className={styles.headerRow}>
          <h3 className={styles.title}>Similar Products</h3>
          <Link href="/products" className={styles.viewAll}>View all</Link>
        </div>
        <p className={styles.emptyState}>Unable to load similar products.</p>
      </section>
    );
  }

  if (!hasProducts) {
    return null; // Hide section entirely when nothing relevant
  }

  return (
    <ErrorBoundary>
      <section className={styles.section} aria-label="Similar products">
        <div className={styles.headerRow}>
          <h3 className={styles.title}>Similar Products</h3>
          <Link href="/products" className={styles.viewAll}>View all</Link>
        </div>
        <div className={styles.grid}>
          {state.products.map((prod) => {
            const handle = generateProductHandle(prod.title);
            return (
              <div key={prod.id ?? handle} className={styles.cardWrapper}>
                {/* Use the exact card used on /products to inherit the hover effect */}
                <ProductCardWithShader product={prod} overlayRef={overlayRef} />
              </div>
            );
          })}
        </div>
        <HoverEffectOverlay ref={overlayRef} debug={process.env.NODE_ENV !== 'production'} />
      </section>
    </ErrorBoundary>
  );
};

export default SimilarProductsSection;
