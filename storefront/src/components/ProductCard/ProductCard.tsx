import React from 'react';
import { CurrencyFormatter } from '../../utils/currencyFormatter';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: {
    title: string;
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
  isHovering?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isHovering = false }) => {
  // Function to render star rating
  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    // Full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(<span key={`star-${i}`} className={styles.fullStar}>★</span>);
    }
    
    // Half star if needed
    if (hasHalfStar) {
      stars.push(<span key="half-star" className={styles.halfStar}>★</span>);
    }
    
    // Empty stars
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<span key={`empty-${i}`} className={styles.emptyStar}>☆</span>);
    }
    
    return stars;
  };

  // Format price with currency
  const formatPrice = (price: number, currency: string = 'USD') => {
    return CurrencyFormatter.formatPrice(price, currency);
  };

  return (
    <div className={styles.productCard}>
      <div className={styles.cardContent}>
        <img 
          src={product.backgroundImage} 
          alt={`${product.title} background`} 
          className={`${styles.backgroundImage} ${isHovering ? styles.backgroundImageHovered : ''}`}
        />
      </div>
      
      {/* Foreground image outside the card content to allow it to break free */}
      <div className={styles.foregroundWrapper}>
        <img 
          src={product.foregroundImage} 
          alt={product.title} 
          className={`${styles.foregroundImage} ${isHovering ? styles.foregroundImageHovered : ''}`}
        />
      </div>
      
      {/* Product details section */}
      <div className={styles.productDetails}>
        <h3 className={styles.productTitle}>{product.title}</h3>
        
        {/* Price information */}
        <div className={styles.priceContainer}>
          {product.price && (
            <span className={styles.price}>{formatPrice(product.price, product.currency)}</span>
          )}
          {product.originalPrice && product.originalPrice > product.price! && (
            <span className={styles.originalPrice}>{formatPrice(product.originalPrice, product.currency)}</span>
          )}
        </div>
        
        {/* Rating and reviews */}
        {product.rating && (
          <div className={styles.ratingContainer}>
            <div className={styles.stars}>
              {renderStars(product.rating)}
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
  );
};

export default ProductCard;
