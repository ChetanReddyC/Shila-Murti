import React, { useRef, useEffect } from 'react';
import styles from './EdgeGradientShaderCanvas.module.css';
import { useShaderEffect } from '../../hooks/useShaderEffect';
import { edgeGradientVertexShaderSource, edgeGradientFragmentShaderSource } from '../../utils/edgeGradientShaderSources';

interface EdgeGradientShaderCanvasProps {
  isHovering: boolean;
}

const EdgeGradientShaderCanvas: React.FC<EdgeGradientShaderCanvasProps> = ({ isHovering }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setHover } = useShaderEffect(
    canvasRef, 
    edgeGradientVertexShaderSource, 
    edgeGradientFragmentShaderSource
  );

  // Handle hover state changes
  useEffect(() => {
    setHover(isHovering);
  }, [isHovering, setHover]);

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
        
        // Update canvas dimensions to match parent but slightly wider
        // Adding extra width to ensure it covers the right edge completely
        if (canvas.width !== Math.ceil(parentWidth * 1.02) || canvas.height !== parentHeight) {
          canvas.width = Math.ceil(parentWidth * 1.02);
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