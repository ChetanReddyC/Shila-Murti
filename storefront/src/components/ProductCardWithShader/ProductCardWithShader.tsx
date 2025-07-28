import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import ShaderCanvas from '../ShaderCanvas/ShaderCanvas';
import EdgeGradientShaderCanvas from '../EdgeGradientShaderCanvas';
import OptimizedImage from '../OptimizedImage';
import { performanceMonitor } from '../../utils/performanceMonitor';
import styles from './ProductCardWithShader.module.css';

interface ProductCardWithShaderProps {
  product: {
    title: string;
    backgroundImage: string;
    foregroundImage: string;
    price?: number;
    originalPrice?: number;
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
    prevProduct.backgroundImage === nextProduct.backgroundImage &&
    prevProduct.foregroundImage === nextProduct.foregroundImage &&
    prevProduct.price === nextProduct.price &&
    prevProduct.originalPrice === nextProduct.originalPrice &&
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
          
          {/* Price information */}
          <div className={styles.priceContainer}>
            {product.price && (
              <span className={styles.price}>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 2
                }).format(product.price)}
              </span>
            )}
            {product.originalPrice && product.originalPrice > product.price! && (
              <span className={styles.originalPrice}>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 2
                }).format(product.originalPrice)}
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
  );
}, arePropsEqual);

ProductCardWithShader.displayName = 'ProductCardWithShader';

export default ProductCardWithShader;
