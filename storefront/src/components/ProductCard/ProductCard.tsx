import React from 'react';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: {
    title: string;
    thumbnail: string;
  };
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  return (
    <div className={styles.productCard}>
      <img src={product.thumbnail} alt={product.title} className={styles.productImage} />
      <h3 className={styles.productTitle}>{product.title}</h3>
    </div>
  );
};

export default ProductCard;
