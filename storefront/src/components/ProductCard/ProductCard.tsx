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
      <img 
        src={product.backgroundImage} 
        alt={`${product.title} background`} 
        className={styles.backgroundImage} 
      />
      <img 
        src={product.foregroundImage} 
        alt={product.title} 
        className={`${styles.foregroundImage} ${isHovering ? styles.foregroundImageHovered : ''}`}
      />
      <h3 className={styles.productTitle}>{product.title}</h3>
    </div>
  );
};

export default ProductCard;
