'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { productsService, ProductsServiceError } from '../../../services/productsService';
import { ProductCardData } from '../../../utils/productDataMapper';
import { Product } from '../../../types/medusa';
import { useRetry } from '../../../hooks/useRetry';
import { isValidHandle, generateProductHandle } from '../../../utils/productHandleGenerator';
import { useCart } from '../../../contexts/CartContext';
import { useWishlist } from '../../../contexts/WishlistContext';
import { medusaApiClient } from '../../../utils/medusaApiClient';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import DynamicSvgEffect from '../../../components/DynamicSvgEffect';
import Reviews from './Reviews';
import styles from './ProductDetailPage.module.css';

// Defer the similar-products grid — it lives below the fold, behind a
// `content-visibility: auto` wrapper, so the user can't see it until they
// scroll near it. Skipping it on the initial render path lets the above-fold
// content paint sooner.
const SimilarProductsSection = dynamic(() => import('./SimilarProductsSection'), { ssr: false });

interface ProductDetailPageProps {
  params: Promise<{ handle: string }>;
}

interface PageState {
  product: Product | null;
  productData: ProductCardData | null;
  loading: boolean;
  error: ProductsServiceError | null;
  isAddingToCart: boolean;
  addToCartSuccess: boolean;
  addToCartError: string | null;
}

const VIEW_LABELS = ['Front', 'Three-quarter', 'Profile', 'Detail', 'In situ'];

// ─── tiny inline icons ─────────────────────────────────────────────────
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const PlusI = () => <Icon><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
const MinusI = () => <Icon><path d="M5 12h14" /></Icon>;
const HeartI = ({ filled }: { filled?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
  </svg>
);
const ChiselI = () => <Icon><path d="M14 4l6 6-9 9-6-6z" /><path d="m4 20 4-1" /></Icon>;
const ShieldI = () => <Icon><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></Icon>;
const TruckI = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h11v8H3z" /><path d="M14 10h4l3 3v2h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
  </svg>
);
const RefreshI = () => <Icon><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" /><path d="M3 21v-5h5" /></Icon>;
const CloseI = () => <Icon><path d="M6 6l12 12" /><path d="M6 18 18 6" /></Icon>;
const ArrowL = () => <Icon><path d="M15 6l-6 6 6 6" /></Icon>;
const ArrowR = () => <Icon><path d="M9 6l6 6-6 6" /></Icon>;
// ─── description ──────────────────────────────────────────────────────
const Description = ({ text }: { text: string }) => (
  <div className={styles.description}>
    <h3>Description</h3>
    <p>{text}</p>
  </div>
);

// ─── mosaic gallery ────────────────────────────────────────────────────
const Gallery = ({
  images,
  activeIdx,
  setActiveIdx,
  onOpenLightbox,
  productTitle,
}: {
  images: string[];
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onOpenLightbox: (i: number) => void;
  productTitle: string;
}) => {
  if (images.length === 0) return null;

  return (
    <div className={styles.gallery}>
      <div className={styles.mosaicStack}>
        {images.map((src, i) => {
          const offset = i - activeIdx;
          const isActive = i === activeIdx;
          // Skip cards fully outside the visible stack window — they paint
          // at opacity 0 anyway, and rendering them keeps GPU layers alive
          // for nothing.
          if (Math.abs(offset) > 2) return null;
          return (
            <div
              key={`${src}-${i}`}
              className={`${styles.mosCard} ${isActive ? styles.mosCardActive : ''}`}
              onClick={() => (isActive ? onOpenLightbox(i) : setActiveIdx(i))}
              style={{
                transform: `translate(${offset * 22}px, ${Math.abs(offset) * 18}px) scale(${1 - Math.abs(offset) * 0.06}) rotate(${offset * 1.5}deg)`,
                zIndex: 10 - Math.abs(offset),
                opacity: isActive ? 1 : 0.6,
                cursor: isActive ? 'zoom-in' : 'pointer',
              }}
            >
              <img src={src} alt={isActive ? productTitle : ''} loading={isActive ? 'eager' : 'lazy'} decoding="async" />
              {isActive && (
                <>
                  <div className={styles.frameCounter}>
                    {String(i + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
                  </div>
                  {VIEW_LABELS[i] && <div className={styles.viewTag}>{VIEW_LABELS[i]}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.mosaicScrubber}>
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.scrubDot} ${i === activeIdx ? styles.scrubDotActive : ''}`}
            onClick={() => setActiveIdx(i)}
            aria-label={`View ${i + 1}`}
          >
            <span className={styles.scrubNum}>{String(i + 1).padStart(2, '0')}</span>
            <span className={styles.scrubLine} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── material story ───────────────────────────────────────────────────
const MaterialStory = () => (
  <section className={styles.materialStory}>
    <div className={styles.msInner}>
      <img className={styles.msPeacock} src="/theme_images/peacock-art-white.png" alt="" aria-hidden="true" />
      <div className={styles.msEyebrow}><span className={styles.eyebrowGlyph} /> The Stone</div>
      <h3 className={styles.msTitle}>
        Quarried near Tadipatri,<br />chiselled by hand.
      </h3>
      <p className={styles.msBody}>
        The block was lifted from the Andhra granite belt — a stone so dense it rings when struck.
        Patient relief work follows: shaping the silhouette, drawing the brow, deepening the gaze.
        No two pieces leave the atelier identical.
      </p>
      <div className={styles.msStats}>
        <div><span className={styles.msNum}>2.74</span><span className={styles.msCap}>g/cm³ density</span></div>
        <div><span className={styles.msNum}>90+</span><span className={styles.msCap}>days in carving</span></div>
        <div><span className={styles.msNum}>∞</span><span className={styles.msCap}>generational</span></div>
      </div>
    </div>
  </section>
);

// ─── trust strip ──────────────────────────────────────────────────────
const CraftStrip = () => {
  const items = [
    { icon: <ShieldI />, t: 'Authenticated', s: 'Hand-signed by the master carver' },
    { icon: <TruckI />, t: 'Insured shipping', s: 'Crated, padded and tracked' },
    { icon: <RefreshI />, t: '7-day returns', s: 'If the form does not move you' },
  ];
  return (
    <div className={styles.craftStrip}>
      <div className={styles.csInner}>
        {items.map((it, i) => (
          <div key={i} className={styles.csItem}>
            <span className={styles.csIcon}>{it.icon}</span>
            <div>
              <div className={styles.csTitle}>{it.t}</div>
              <div className={styles.csSub}>{it.s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── lightbox ─────────────────────────────────────────────────────────
const Lightbox = ({
  open, idx, images, onClose, onPrev, onNext,
}: {
  open: boolean;
  idx: number;
  images: string[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext]);

  // Skip rendering entirely when closed — the previous version kept the
  // dialog DOM mounted with display:none, which still cost layout/parse work.
  if (!open) return null;
  return (
    <div className={`${styles.lightbox} ${styles.lightboxOpen}`} role="dialog" aria-modal="true">
      <button className={`${styles.lbBtn} ${styles.lbClose}`} onClick={onClose} aria-label="Close"><CloseI /></button>
      <button className={`${styles.lbBtn} ${styles.lbPrev}`} onClick={onPrev} aria-label="Previous"><ArrowL /></button>
      <button className={`${styles.lbBtn} ${styles.lbNext}`} onClick={onNext} aria-label="Next"><ArrowR /></button>
      {images[idx] && <img src={images[idx]} alt="" />}
      <div className={styles.lbCounter}>
        {String(idx + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
      </div>
    </div>
  );
};

// ─── main component ───────────────────────────────────────────────────
export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const [handle, setHandle] = useState<string | null>(null);
  const { addToCart, loading: cartLoading } = useCart();
  const { isInWishlist, toggleWishlist, pendingIds: wishPending, isAuthenticated: wishAuth } = useWishlist();

  const [state, setState] = useState<PageState>({
    product: null,
    productData: null,
    loading: true,
    error: null,
    isAddingToCart: false,
    addToCartSuccess: false,
    addToCartError: null,
  });
  const [qty, setQty] = useState(1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<{ open: boolean; idx: number }>({ open: false, idx: 0 });

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const update = useCallback((u: Partial<PageState>) => {
    if (!isMounted.current) return;
    setState(prev => ({ ...prev, ...u }));
  }, []);

  const { retryCount, isRetrying, canRetry, retry, reset } = useRetry({
    maxRetries: 3, initialDelay: 1000, backoffMultiplier: 2, maxDelay: 10000,
  });

  // resolve route params
  useEffect(() => {
    params.then(p => {
      if (!isValidHandle(p.handle)) { notFound(); return; }
      setHandle(p.handle);
    });
  }, [params]);

  const fetchProduct = useCallback(async () => {
    if (!handle) return;
    try {
      update({ loading: true, error: null, addToCartError: null, addToCartSuccess: false });
      try {
        const [productData, rawProduct] = await Promise.all([
          productsService.fetchProductByHandle(handle),
          medusaApiClient.getProductByHandle(handle),
        ]);
        if (!isMounted.current) return;
        update({ productData, product: rawProduct, loading: false });
        reset();
      } catch (handleError) {
        // Fall back: search all products by generated handle
        const all = await productsService.fetchProducts();
        const match = all.find(p => generateProductHandle(p.title) === handle);
        if (!match) { notFound(); return; }
        let rawProduct: Product | null = null;
        try { rawProduct = await medusaApiClient.getProduct(match.id); } catch { /* tolerated */ }
        if (!isMounted.current) return;
        update({ productData: match, product: rawProduct, loading: false });
        reset();
      }
    } catch (err) {
      if (!isMounted.current) return;
      const e = err as ProductsServiceError;
      if (e.type === 'api' && e.originalError && 'status' in e.originalError && (e.originalError as any).status === 404) {
        notFound(); return;
      }
      update({ error: e, loading: false });
    }
  }, [handle, update, reset]);

  useEffect(() => { if (handle) fetchProduct(); }, [handle, fetchProduct]);

  const handleRetry = useCallback(async () => {
    if (!canRetry || !isMounted.current) return;
    try { await retry(fetchProduct); } catch { /* error handled inside */ }
  }, [retry, fetchProduct, canRetry]);

  // build gallery image list from real product data
  const images = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (u?: string | null) => {
      if (!u) return;
      if (seen.has(u)) return;
      seen.add(u);
      out.push(u);
    };
    if (state.product?.images?.length) {
      state.product.images.forEach(img => push(img.url));
    }
    push(state.productData?.foregroundImage);
    push(state.productData?.backgroundImage);
    return out;
  }, [state.product, state.productData]);

  // keep active index in range when images change
  useEffect(() => {
    if (activeIdx >= images.length && images.length > 0) setActiveIdx(0);
  }, [images.length, activeIdx]);

  // ─── add to cart (mirrors original logic) ────────────────────────
  const handleAddToCart = useCallback(async () => {
    if (!addToCart || !state.productData || !state.product) return;

    if (!state.productData.inStock) {
      const allowBackorder = state.productData.inventory?.allowBackorder;
      if (!allowBackorder) {
        update({ addToCartError: 'This product is currently out of stock.', addToCartSuccess: false });
        return;
      }
    }
    if (!state.product.variants?.length) {
      update({ addToCartError: 'This product has no available variants.', addToCartSuccess: false });
      return;
    }

    let selectedVariant = null;
    for (const v of state.product.variants) {
      let hasStock = false;
      if (typeof v.inventory_quantity === 'number' && v.inventory_quantity > 0) hasStock = true;
      else if (v.inventory_items?.length) {
        let avail = 0;
        for (const ii of v.inventory_items) {
          for (const lvl of ii.inventory?.location_levels || []) avail += lvl?.available_quantity || 0;
        }
        hasStock = avail >= qty;
      } else if (!v.manage_inventory) hasStock = true;
      else if (v.manage_inventory && state.productData.inStock) hasStock = true;
      if (!hasStock && v.allow_backorder) hasStock = true;
      if (hasStock) { selectedVariant = v; break; }
    }
    if (!selectedVariant) {
      update({ addToCartError: 'No product variant with sufficient stock is available.', addToCartSuccess: false });
      return;
    }

    update({ isAddingToCart: true, addToCartError: null, addToCartSuccess: false });
    try {
      let estimatedUnitPrice: number | undefined;
      if (selectedVariant.prices?.length) {
        estimatedUnitPrice = Number(selectedVariant.prices[0].amount || 0) / 100;
      }
      await addToCart(selectedVariant.id, qty, estimatedUnitPrice);
      update({ addToCartSuccess: true });
      setTimeout(() => update({ addToCartSuccess: false }), 3000);
    } catch (err) {
      let msg = 'Failed to add item to cart. Please try again.';
      if (err instanceof Error) {
        if (err.message.includes('out of stock') || err.message.includes('insufficient stock')) {
          msg = 'This item is currently out of stock or has insufficient quantity available.';
        } else if (err.message.includes('cart not found')) {
          msg = 'Your cart session has expired. Please refresh the page and try again.';
        } else msg = err.message;
      }
      update({ addToCartError: msg });
      setTimeout(() => update({ addToCartError: null }), 5000);
    } finally {
      update({ isAddingToCart: false });
    }
  }, [addToCart, state.product, state.productData, qty, update]);

  // ─── render: handle resolution ───────────────────────────────────
  if (!handle) {
    return (
      <div className={styles.stateWrap}>
        <div>
          <h1 className={styles.stateTitle}>Loading…</h1>
        </div>
      </div>
    );
  }

  if (state.loading || isRetrying) {
    return (
      <div className={styles.stateWrap}>
        <div>
          <LoadingSpinner size="medium" color="primary" />
          <p className={styles.stateMsg} style={{ marginTop: '1rem' }}>Loading product…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.stateWrap}>
        <div>
          <h1 className={styles.stateTitle}>Error Loading Product</h1>
          <p className={styles.stateMsg}>{state.error.message}</p>
          {canRetry && (
            <button className={styles.retryBtn} onClick={handleRetry}>
              Try Again {retryCount > 0 && `(${retryCount}/3)`}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!state.productData) { notFound(); return null; }

  const product = state.productData;
  const rawProduct = state.product;
  const currency = product.currency || 'INR';
  const fmt = (n?: number) => (typeof n === 'number'
    ? (currency === 'INR' ? `₹ ${n.toLocaleString('en-IN')}` : `${currency} ${n.toLocaleString()}`)
    : '—');
  const savePct = product.originalPrice && product.price && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const inWishlist = !!(rawProduct && isInWishlist(rawProduct.id));
  const wishlistBusy = !!(rawProduct && wishPending.has(rawProduct.id));

  return (
    <div className={styles.pdp}>
      <div className={styles.pdpBg} aria-hidden="true">
        {/* Each art's spotlight rims its INNER (page-facing) edge:
              right-of-page arts (peacock, elephant) → light runs down their LEFT side
              left-of-page arts  (mandala, lakshmi)  → light runs down their RIGHT side
            so the highlight always travels toward the reader's gaze, not off the screen.
            spotlightFilter is the vivid filter for the revealed copy; the dim base
            stays at the toned-down filter set on .bgImg in the module CSS. */}
        <DynamicSvgEffect
          className={`${styles.bgArt} ${styles.bgPeacock}`}
          effect="spotlight"
          rimSide="left"
          spotlightFilter="grayscale(100%) contrast(1.18) brightness(0.45)"
        >
          <img className={styles.bgImg} src="/theme_images/peacock-art-white.png" alt="" />
        </DynamicSvgEffect>
        <DynamicSvgEffect
          className={`${styles.bgArt} ${styles.bgMandala}`}
          effect="spotlight"
          rimSide="right"
          spotlightFilter="grayscale(100%) contrast(1.18) brightness(0.45)"
        >
          <img className={styles.bgImg} src="/theme_images/templefront-white.png" alt="" />
        </DynamicSvgEffect>
        <DynamicSvgEffect
          className={`${styles.bgArt} ${styles.bgElephant}`}
          effect="spotlight"
          rimSide="left"
          spotlightFilter="grayscale(100%) contrast(1.18) brightness(0.45)"
        >
          <img className={styles.bgImg} src="/theme_images/elephant-art-white.png" alt="" />
        </DynamicSvgEffect>
        <DynamicSvgEffect
          className={`${styles.bgArt} ${styles.bgSvgBand}`}
          effect="spotlight"
          rimSide="right"
          spotlightFilter="grayscale(100%) contrast(1.18) brightness(0.45)"
        >
          <img className={styles.bgImg} src="/theme_images/Godess-lakshmi-white.png" alt="" />
        </DynamicSvgEffect>
      </div>

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span className={styles.sep}>/</span>
        <a href="/products">Products</a>
        <span className={styles.sep}>/</span>
        <span className={styles.here}>{product.title}</span>
      </nav>

      <ErrorBoundary>
        <div className={styles.productGrid}>
          <div className={styles.leftCol}>
            <Gallery
              images={images}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              onOpenLightbox={(i) => setLightbox({ open: true, idx: i })}
              productTitle={product.title}
            />
            <MaterialStory />
          </div>

          <div className={styles.info}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowGlyph} /> Hand-Carved · Tadipatri Atelier
            </div>
            <h1 className={styles.productTitle}>{product.title}</h1>
            {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

            <div className={styles.ornamentDivider}>
              <span className={styles.dividerLine} />
              <span className={styles.dividerGlyph}>✦</span>
              <span className={styles.dividerLine} />
            </div>

            <div className={styles.priceRow}>
              <span className={styles.price}>{fmt(product.price)}</span>
              {product.originalPrice && product.originalPrice > (product.price || 0) && (
                <>
                  <span className={styles.strike}>{fmt(product.originalPrice)}</span>
                  <span className={styles.savePill}>Save {savePct}%</span>
                </>
              )}
            </div>

            <div className={styles.detailsBox}>
              {product.material && (
                <div className={styles.detailsRow}>
                  <span className={styles.detailsLabel}>Material</span>
                  <span className={styles.detailsValue}>{product.material}</span>
                </div>
              )}
              {product.dimensions && (
                <div className={styles.detailsRow}>
                  <span className={styles.detailsLabel}>Dimensions</span>
                  <span className={styles.detailsValue}>{product.dimensions}</span>
                </div>
              )}
              {product.weight != null && (
                <div className={styles.detailsRow}>
                  <span className={styles.detailsLabel}>Weight</span>
                  <span className={styles.detailsValue}>
                    {product.weight} {product.weightUnit || 'g'}
                  </span>
                </div>
              )}
              <div className={styles.detailsRow}>
                <span className={styles.detailsLabel}>Availability</span>
                <span className={`${styles.stock} ${!product.inStock ? styles.stockOut : ''}`}>
                  <span className={`${styles.stockDot} ${!product.inStock ? styles.stockDotOut : ''}`} />
                  {product.inStock ? 'In Stock' : 'Out of Stock'}
                </span>
              </div>
            </div>

            {product.description && <Description text={product.description} />}

            <div className={`${styles.buyBox} ${styles.buyBoxSticky}`}>
              <div className={styles.qtyRow}>
                <span className={styles.qtyLabel}>Quantity</span>
                <div className={styles.qty}>
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                    <MinusI />
                  </button>
                  <span className={styles.qtyValue}>{qty}</span>
                  <button onClick={() => setQty(q => Math.min(10, q + 1))} disabled={qty >= 10} aria-label="Increase quantity">
                    <PlusI />
                  </button>
                </div>
              </div>
              <p className={styles.shipNote}>Free shipping on orders over $50</p>
              <div className={styles.actions}>
                <button
                  className={styles.cta}
                  onClick={handleAddToCart}
                  disabled={!product.inStock || state.isAddingToCart || cartLoading}
                >
                  {(state.isAddingToCart || cartLoading) ? (
                    <>
                      <LoadingSpinner size="small" color="white" />
                      <span>Adding…</span>
                    </>
                  ) : !product.inStock ? (
                    <span>Out of Stock</span>
                  ) : (
                    <>
                      <ChiselI />
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>
                <button
                  className={`${styles.wish} ${inWishlist ? styles.wishActive : ''}`}
                  aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                  disabled={wishlistBusy}
                  onClick={async () => {
                    if (!rawProduct) return;
                    if (!wishAuth) { window.location.href = '/login'; return; }
                    await toggleWishlist(rawProduct.id);
                  }}
                >
                  <HeartI filled={inWishlist} />
                </button>
              </div>
              {state.addToCartSuccess && (
                <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>Added to cart</div>
              )}
              {state.addToCartError && (
                <div className={`${styles.feedback} ${styles.feedbackError}`}>{state.addToCartError}</div>
              )}
            </div>
          </div>
        </div>

        <CraftStrip />

        <div className={styles.reviewsWrap}>
          {/* Demoing the empty state by passing an explicit []. Drop the
              prop (or pass real reviews) to switch to the populated view. */}
          <Reviews reviews={[]} />
        </div>

        <div className={styles.similarWrap}>
          <SimilarProductsSection current={product} />
        </div>
      </ErrorBoundary>

      <Lightbox
        open={lightbox.open}
        idx={lightbox.idx}
        images={images}
        onClose={() => setLightbox(s => ({ ...s, open: false }))}
        onPrev={() => setLightbox(s => ({ ...s, idx: (s.idx - 1 + images.length) % images.length }))}
        onNext={() => setLightbox(s => ({ ...s, idx: (s.idx + 1) % images.length }))}
      />
    </div>
  );
}
