import React from 'react';
import LoadingSkeleton from '../LoadingSkeleton';
import styles from './ProductCardSkeleton.module.css';

const ProductCardSkeleton: React.FC = () => {
  return (
    <div className={styles.cardContainer}>
      <div className={styles.cardWrapper}>
        {/* Image section skeleton */}
        <div className={styles.imageSection}>
          <LoadingSkeleton className={styles.imageSkeleton} />
        </div>
        
        {/* Product details section skeleton */}
        <div className={styles.productDetails}>
          {/* Title skeleton */}
          <LoadingSkeleton className={styles.titleSkeleton} />
          
          {/* Price skeleton */}
          <div className={styles.priceContainer}>
            <LoadingSkeleton className={styles.priceSkeleton} />
            <LoadingSkeleton className={styles.originalPriceSkeleton} />
          </div>
          
          {/* Rating skeleton */}
          <div className={styles.ratingContainer}>
            <LoadingSkeleton className={styles.starsSkeleton} />
            <LoadingSkeleton className={styles.reviewCountSkeleton} />
          </div>
          
          {/* Specifications skeleton */}
          <div className={styles.specifications}>
            <div className={styles.specItem}>
              <LoadingSkeleton className={styles.specLabelSkeleton} />
              <LoadingSkeleton className={styles.specValueSkeleton} />
            </div>
            <div className={styles.specItem}>
              <LoadingSkeleton className={styles.specLabelSkeleton} />
              <LoadingSkeleton className={styles.specValueSkeleton} />
            </div>
          </div>
          
          {/* Availability skeleton */}
          <div className={styles.availability}>
            <LoadingSkeleton className={styles.availabilitySkeleton} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCardSkeleton;