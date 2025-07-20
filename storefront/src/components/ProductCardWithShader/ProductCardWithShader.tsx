import React, { useState } from 'react';
import ProductCard from '../ProductCard/ProductCard';
import ShaderCanvas from '../ShaderCanvas/ShaderCanvas';
import styles from './ProductCardWithShader.module.css';

interface ProductCardWithShaderProps {
  product: {
    title: string;
    backgroundImage: string;
    foregroundImage: string;
  };
}

const ProductCardWithShader: React.FC<ProductCardWithShaderProps> = ({ product }) => {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      className={styles.cardContainer}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchStart={() => setIsHovering(true)}
      onTouchEnd={() => setIsHovering(false)}
    >
      <ProductCard product={product} isHovering={isHovering} />
      <ShaderCanvas isHovering={isHovering} />
    </div>
  );
};

export default ProductCardWithShader;
