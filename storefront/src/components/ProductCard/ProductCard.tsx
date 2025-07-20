import React from 'react';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: {
    title: string;
    backgroundImage: string;
    foregroundImage: string;
  };
  isHovering?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isHovering = false }) => {
  return (
    <div className={styles.productCard}>
      <div className={styles.cardContent}>
        <img 
          src={product.backgroundImage} 
          alt={`${product.title} background`} 
          className={`${styles.backgroundImage} ${isHovering ? styles.backgroundImageHovered : ''}`}
        />
        <h3 className={styles.productTitle}>{product.title}</h3>
      </div>
      
      {/* Foreground image outside the card content to allow it to break free */}
      <div className={styles.foregroundWrapper}>
        <img 
          src={product.foregroundImage} 
          alt={product.title} 
          className={`${styles.foregroundImage} ${isHovering ? styles.foregroundImageHovered : ''}`}
        />
      </div>
    </div>
  );
};

export default ProductCard;
