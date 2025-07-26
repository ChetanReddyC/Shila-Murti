import React from 'react';
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
  cosmicVariation?: number;
}

const ProductCardWithShader: React.FC<ProductCardWithShaderProps> = ({ product, cosmicVariation = 1 }) => {
  // Removed all hover state and 3D tilt functionality for plain hover effect

  return (
    <div className={styles.cardContainer}>
      <div className={styles.cardWrapper}>
        {/* Simple image section without effects */}
        <div className={styles.imageSection}>
          <div className={styles.cardContentWrapper}>
            <div className={styles.cardContent}>
              <img 
                src={product.backgroundImage} 
                alt={`${product.title} background`} 
                className={styles.backgroundImage}
              />
            </div>
            
            {/* Foreground image - no hover effects */}
            <div className={styles.foregroundWrapper}>
              <img 
                src={product.foregroundImage} 
                alt={product.title} 
                className={styles.foregroundImage}
              />
            </div>
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
};

export default ProductCardWithShader;
