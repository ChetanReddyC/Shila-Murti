import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import Link from 'next/link';
import ShaderCanvas from '../ShaderCanvas/ShaderCanvas';
import EdgeGradientShaderCanvas from '../EdgeGradientShaderCanvas';
import OptimizedImage from '../OptimizedImage';
import { performanceMonitor } from '../../utils/performanceMonitor';
import { CurrencyFormatter } from '../../utils/currencyFormatter';
import { generateProductHandle } from '../../utils/productHandleGenerator';
import styles from './ProductCardWithShader.module.css';

interface ProductCardWithShaderProps {
  product: {
    title: string;
    subtitle?: string | null;
    backgroundImage: string;
    foregroundImage: string;
    price?: number;
    originalPrice?: number;
    currency?: string;
    rating?: number;
    reviewCount?: number;
    material?: string;
    dimensions?: string;
    inStock?: boolean;
  };
}

// Custom comparison function for React.memo
const arePropsEqual = (
  prevProps: ProductCardWithShaderProps,
  nextProps: ProductCardWithShaderProps
): boolean => {
  const { product: prevProduct } = prevProps;
  const { product: nextProduct } = nextProps;

  // Deep comparison of product properties
  return (
    prevProduct.title === nextProduct.title &&
    prevProduct.subtitle === nextProduct.subtitle &&
    prevProduct.backgroundImage === nextProduct.backgroundImage &&
    prevProduct.foregroundImage === nextProduct.foregroundImage &&
    prevProduct.price === nextProduct.price &&
    prevProduct.originalPrice === nextProduct.originalPrice &&
    prevProduct.currency === nextProduct.currency &&
    prevProduct.rating === nextProduct.rating &&
    prevProduct.reviewCount === nextProduct.reviewCount &&
    prevProduct.material === nextProduct.material &&
    prevProduct.dimensions === nextProduct.dimensions &&
    prevProduct.inStock === nextProduct.inStock
  );
};

const ProductCardWithShader: React.FC<ProductCardWithShaderProps> = memo(({ product }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isHoveringImageSection, setIsHoveringImageSection] = useState(false);

  // Generate handle from product title
  const productHandle = generateProductHandle(product.title);

  // Debug: Log the product data received by the component
  useEffect(() => {
    console.log('[ProductCardWithShader] Product data received:', {
      title: product.title,
      price: product.price,
      currency: product.currency,
      originalPrice: product.originalPrice,
      material: product.material,
      dimensions: product.dimensions,
      inStock: product.inStock
    });

    // If price is 0, let's test the API directly
    if (!product.price || product.price === 0) {
      console.log('🔍 Price is 0, testing API directly...');
      fetch('http://localhost:9000/store/products?region_id=reg_01JYR9W6MVF236JPJ91FFG427S', {
        headers: {
          'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
        }
      })
        .then(res => res.json())
        .then(data => {
          console.log('🔍 Direct API test result:', {
            productsCount: data.products?.length,
            firstProduct: data.products?.[0] ? {
              title: data.products[0].title,
              variantsCount: data.products[0].variants?.length,
              firstVariant: data.products[0].variants?.[0] ? {
                prices: data.products[0].variants[0].prices,
                material: data.products[0].variants[0].material,
                dimensions: {
                  length: data.products[0].variants[0].length,
                  width: data.products[0].variants[0].width,
                  height: data.products[0].variants[0].height
                }
              } : null
            } : null
          });
        })
        .catch(err => console.error('🔍 Direct API test failed:', err));
    }
  }, [product]);

  // Helper function to format price with proper currency
  const formatPrice = (price: number, currency: string = 'USD') => {
    return CurrencyFormatter.formatPrice(price, currency);
  };

  // Track render performance
  const renderStartTime = useRef(performance.now());

  useEffect(() => {
    const renderTime = Math.round(performance.now() - renderStartTime.current);
    performanceMonitor.trackComponentRender('ProductCardWithShader', renderTime, {
      productTitle: product.title,
      hasPrice: !!product.price,
      hasRating: !!product.rating,
      inStock: product.inStock
    });
  });

  // --- 3D tilt state & refs -------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const imageSectionRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);

  const resetTilt = useCallback(() => {
    if (imageSectionRef.current) {
      imageSectionRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    }
  }, []);

  const handleImageSectionMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!imageSectionRef.current || !isHoveringImageSection) return;

    // Cancel any previous frame to avoid accumulation
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    requestRef.current = requestAnimationFrame(() => {
      const rect = imageSectionRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Normalize between -1 and 1
      const midX = rect.width / 2;
      const midY = rect.height / 2;
      const normX = (x - midX) / midX; // -1 (left) to 1 (right)
      const normY = (midY - y) / midY; // -1 (bottom) to 1 (top)

      const maxRotation = 8; // degrees, subtle tilt
      const rotY = normX * maxRotation;
      const rotX = normY * maxRotation;

      imageSectionRef.current!.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    });
  }, [isHoveringImageSection]);

  const handleContainerMouseLeave = useCallback(() => {
    resetTilt();
    setIsHovering(false);
    setIsHoveringImageSection(false);
  }, [resetTilt]);

  const handleContainerMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleImageSectionMouseEnter = useCallback(() => {
    setIsHoveringImageSection(true);
  }, []);

  const handleImageSectionMouseLeave = useCallback(() => {
    setIsHoveringImageSection(false);
    resetTilt();
  }, [resetTilt]);

  return (
    <Link href={`/products/${productHandle}`} className={styles.cardLink}>
      <div
        ref={containerRef}
        className={`${styles.cardContainer} ${isHovering ? styles.cardContainerHovered : ''}`}
        onMouseEnter={handleContainerMouseEnter}
        onMouseLeave={handleContainerMouseLeave}
        onTouchStart={() => setIsHovering(true)}
        onTouchEnd={() => setIsHovering(false)}
      >
        <div className={styles.cardWrapper}>
        {/* Image section with 3D rotation effect */}
        <div
          ref={imageSectionRef}
          className={styles.imageSection}
          onMouseEnter={handleImageSectionMouseEnter}
          onMouseLeave={handleImageSectionMouseLeave}
          onMouseMove={handleImageSectionMouseMove}
        >
          <div className={styles.cardContentWrapper}>
            <div className={styles.cardContent}>
              <OptimizedImage
                src={product.backgroundImage}
                alt={`${product.title} background`}
                fallbackSrc="/images/placeholder-background.svg"
                className={`${styles.backgroundImage} ${isHovering ? styles.backgroundImageHovered : ''}`}
                priority={false}
                showRetryButton={false}
              />
            </div>

            {/* Foreground image outside the card content to allow it to break free */}
            <div className={styles.foregroundWrapper}>
              <OptimizedImage
                src={product.foregroundImage}
                alt={product.title}
                fallbackSrc="/images/placeholder-product.svg"
                className={`${styles.foregroundImage} ${isHovering ? styles.foregroundImageHovered : ''}`}
                priority={false}
                showRetryButton={false}
              />
            </div>
          </div>

          <div className={styles.effectsWrapper}>
            <ShaderCanvas isHovering={isHovering} />
            <EdgeGradientShaderCanvas isHovering={isHovering} />
          </div>
        </div>

        {/* Product details section - no 3D rotation effect */}
        <div className={styles.productDetails}>
          <h3 className={styles.productTitle}>{product.title}</h3>
          {product.subtitle && (
            <p className={styles.productSubtitle}>{product.subtitle}</p>
          )}

          {/* Price information */}
          <div className={styles.priceContainer}>
            {(product.price !== undefined && product.price !== null && product.price > 0) && (
              <span className={styles.price}>
                {formatPrice(product.price, product.currency)}
              </span>
            )}
            {product.originalPrice && product.originalPrice > (product.price || 0) && (
              <span className={styles.originalPrice}>
                {formatPrice(product.originalPrice, product.currency)}
              </span>
            )}
            {/* Debug: Show when price is missing */}
            {(!product.price || product.price <= 0) && (
              <span style={{ color: 'red', fontSize: '12px' }}>
                [DEBUG: Price missing - {JSON.stringify({ price: product.price, currency: product.currency })}]
              </span>
            )}
          </div>

          {/* Rating and reviews */}
          {product.rating && (
            <div className={styles.ratingContainer}>
              <div className={styles.stars}>
                {Array.from({ length: Math.floor(product.rating) }).map((_, i) => (
                  <span key={`star-${i}`} className={styles.fullStar}>★</span>
                ))}
                {product.rating % 1 >= 0.5 && (
                  <span key="half-star" className={styles.halfStar}>★</span>
                )}
                {Array.from({ length: 5 - Math.floor(product.rating) - (product.rating % 1 >= 0.5 ? 1 : 0) }).map((_, i) => (
                  <span key={`empty-${i}`} className={styles.emptyStar}>☆</span>
                ))}
              </div>
              {product.reviewCount && (
                <span className={styles.reviewCount}>({product.reviewCount})</span>
              )}
            </div>
          )}

          {/* Product specifications */}
          <div className={styles.specifications}>
            {product.material && (
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Material:</span>
                <span className={styles.specValue}>{product.material}</span>
              </div>
            )}
            {product.dimensions && (
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Size:</span>
                <span className={styles.specValue}>{product.dimensions}</span>
              </div>
            )}
          </div>

          {/* Availability */}
          <div className={styles.availability}>
            {product.inStock ? (
              <span className={styles.inStock}>In Stock</span>
            ) : (
              <span className={styles.outOfStock}>Out of Stock</span>
            )}
          </div>
        </div>
        </div>
      </div>
    </Link>
  );
}, arePropsEqual);

ProductCardWithShader.displayName = 'ProductCardWithShader';

export default ProductCardWithShader;
