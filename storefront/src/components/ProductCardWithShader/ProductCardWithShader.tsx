import React, { useState, useRef, useCallback } from 'react';
import ProductCard from '../ProductCard/ProductCard';
import ShaderCanvas from '../ShaderCanvas/ShaderCanvas';
import EdgeGradientShaderCanvas from '../EdgeGradientShaderCanvas';
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

  // --- 3D tilt state & refs -------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();

  const resetTilt = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!containerRef.current) return;

    // Cancel any previous frame to avoid accumulation
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    requestRef.current = requestAnimationFrame(() => {
      const rect = containerRef.current!.getBoundingClientRect();
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

      containerRef.current!.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    resetTilt();
    setIsHovering(false);
  }, [resetTilt]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${styles.cardContainer} ${isHovering ? styles.cardContainerHovered : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={() => setIsHovering(true)}
      onTouchEnd={() => setIsHovering(false)}
    >
      <ProductCard product={product} isHovering={isHovering} />
      <ShaderCanvas isHovering={isHovering} />
      <EdgeGradientShaderCanvas isHovering={isHovering} />
    </div>
  );
};

export default ProductCardWithShader;
