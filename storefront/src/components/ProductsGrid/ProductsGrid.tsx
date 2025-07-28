import React, { memo } from 'react';
import ProductCardWithShader from '../ProductCardWithShader/ProductCardWithShader';
import ProductCardSkeleton from '../ProductCardSkeleton';
import { ErrorState, EmptyState } from '../ErrorStates';
import { ProductCardData } from '../../utils/productDataMapper';
import { ProductsServiceError } from '../../services/productsService';
import styles from './ProductsGrid.module.css';

interface ProductsGridProps {
  products: ProductCardData[];
  loading: boolean;
  error: ProductsServiceError | null;
  onRetry: () => void;
  retryCount?: number;
  maxRetries?: number;
  skeletonCount?: number;
}

// Custom comparison function for React.memo
const arePropsEqual = (
  prevProps: ProductsGridProps,
  nextProps: ProductsGridProps
): boolean => {
  return (
    prevProps.loading === nextProps.loading &&
    prevProps.error === nextProps.error &&
    prevProps.retryCount === nextProps.retryCount &&
    prevProps.maxRetries === nextProps.maxRetries &&
    prevProps.skeletonCount === nextProps.skeletonCount &&
    prevProps.onRetry === nextProps.onRetry &&
    // Deep comparison for products array
    prevProps.products.length === nextProps.products.length &&
    prevProps.products.every((product, index) => {
      const nextProduct = nextProps.products[index];
      return (
        product.title === nextProduct.title &&
        product.backgroundImage === nextProduct.backgroundImage &&
        product.foregroundImage === nextProduct.foregroundImage &&
        product.price === nextProduct.price &&
        product.originalPrice === nextProduct.originalPrice &&
        product.rating === nextProduct.rating &&
        product.reviewCount === nextProduct.reviewCount &&
        product.material === nextProduct.material &&
        product.dimensions === nextProduct.dimensions &&
        product.inStock === nextProduct.inStock
      );
    })
  );
};

const ProductsGrid: React.FC<ProductsGridProps> = memo(({
  products,
  loading,
  error,
  onRetry,
  retryCount = 0,
  maxRetries = 3,
  skeletonCount = 6
}) => {
  // Loading state - show skeleton cards
  if (loading) {
    return (
      <div className={styles.productsGrid}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <div key={`skeleton-${index}`} className={styles.productCardWrapper}>
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  // Error state - show appropriate error component
  if (error) {
    return (
      <div className={styles.errorWrapper}>
        <ErrorState
          error={error}
          onRetry={onRetry}
          retryCount={retryCount}
          maxRetries={maxRetries}
        />
      </div>
    );
  }

  // Empty state - no products found
  if (products.length === 0) {
    return (
      <div className={styles.errorWrapper}>
        <EmptyState onRetry={onRetry} />
      </div>
    );
  }

  // Success state - show products
  return (
    <div className={styles.productsGrid}>
      {products.map((product, index) => (
        <div key={product.title || `product-${index}`} className={styles.productCardWrapper}>
          <ProductCardWithShader product={product} />
        </div>
      ))}
    </div>
  );
}, arePropsEqual);

ProductsGrid.displayName = 'ProductsGrid';

export default ProductsGrid;