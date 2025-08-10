import React, { useRef, useEffect, useState } from 'react';
import styles from './EdgeGradientShaderCanvas.module.css';
import { useShaderEffect } from '../../hooks/useShaderEffect';
import { edgeGradientVertexShaderSource, edgeGradientFragmentShaderSource } from '../../utils/edgeGradientShaderSources';

interface EdgeGradientShaderCanvasProps {
  isHovering: boolean;
}

const EdgeGradientShaderCanvas: React.FC<EdgeGradientShaderCanvasProps> = ({ isHovering }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shaderError, setShaderError] = useState(false);
  
  // Wrap the shader effect with error handling
  let shaderHook;
  try {
    shaderHook = useShaderEffect(
      canvasRef, 
      edgeGradientVertexShaderSource, 
      edgeGradientFragmentShaderSource
    );
  } catch (error) {
    console.error('Edge gradient shader initialization failed:', error);
    setShaderError(true);
  }

  const { setHover } = shaderHook || { setHover: () => {} };

  // Handle hover state changes
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
        // Get the computed style of the parent to account for any CSS transforms
        const parentStyle = window.getComputedStyle(parentElement);
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

  // Handle touch events for mobile devices
  const handleTouch = (e: React.TouchEvent) => {
    if (!canvasRef.current || !isHovering || e.touches.length === 0) return;
    
    // Simulate a mouse move event for the touch position
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const simulatedMouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true,
      view: window
    });
    
    window.dispatchEvent(simulatedMouseEvent);
    
    // Prevent default to avoid scrolling while interacting with the card
    e.preventDefault();
  };

  // If shader failed to initialize, return a hidden canvas to avoid layout issues
  if (shaderError) {
    return (
      <div 
        ref={containerRef}
        className={styles.canvasContainer}
        style={{ display: 'none' }}
      >
        <canvas 
          ref={canvasRef} 
          className={styles.edgeGradientCanvas} 
          style={{ backgroundColor: 'transparent' }} 
        />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={styles.canvasContainer}
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
    >
      <canvas 
        ref={canvasRef} 
        className={styles.edgeGradientCanvas} 
        style={{ backgroundColor: 'transparent' }} 
      />
    </div>
  );
};

export default EdgeGradientShaderCanvas; 