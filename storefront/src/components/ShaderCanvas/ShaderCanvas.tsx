import React, { useRef, useEffect, useState } from 'react';
import styles from './ShaderCanvas.module.css';
import { useShaderEffect } from '../../hooks/useShaderEffect';
import { vertexShaderSource, fragmentShaderSource } from '../../utils/shaderSources';

export interface ShaderCanvasProps {
  isHovering: boolean;
}

const ShaderCanvas: React.FC<ShaderCanvasProps> = ({ isHovering }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaderError, setShaderError] = useState(false);
  
  // Wrap the shader effect with error handling
  let shaderHook;
  try {
    shaderHook = useShaderEffect(canvasRef, vertexShaderSource, fragmentShaderSource);
  } catch (error) {
    setShaderError(true);
  }

  const { setHover } = shaderHook || { setHover: () => {} };

  useEffect(() => {
    if (!shaderError) {
      setHover(isHovering);
    }
  }, [isHovering, setHover, shaderError]);

  // Handle manual resizing
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const parentElement = canvas.parentElement;
      
      if (parentElement) {
        const parentWidth = parentElement.clientWidth;
        const parentHeight = parentElement.clientHeight;
        
        // Update canvas dimensions to exactly match parent
        if (canvas.width !== parentWidth || canvas.height !== parentHeight) {
          canvas.width = parentWidth;
          canvas.height = parentHeight;
        }
      }
    };

    // Initial size adjustment
    handleResize();
    
    // Listen for window resize events
    window.addEventListener('resize', handleResize);
    
    // Observe size changes using ResizeObserver if available
    let resizeObserver: ResizeObserver | null = null;
    if (canvasRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvasRef.current.parentElement as Element);
    }
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  // If shader failed to initialize, return a hidden canvas to avoid layout issues
  if (shaderError) {
    return <canvas ref={canvasRef} className={styles.shaderCanvas} style={{ backgroundColor: 'transparent', display: 'none' }} />;
  }

  return <canvas ref={canvasRef} className={styles.shaderCanvas} style={{ backgroundColor: 'transparent' }} />;
};

export default ShaderCanvas;
