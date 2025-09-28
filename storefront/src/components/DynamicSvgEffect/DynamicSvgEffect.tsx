import React, { useState, useRef, useId, useCallback } from 'react';
import styles from './DynamicSvgEffect.module.css';

interface DynamicSvgEffectProps {
  /** A single React element, expected to be an SVG. */
  children: React.ReactElement;
  /** The size of the spotlight mask in pixels. Default is 400. */
  spotlightSize?: number;
  /** The color of the specular light highlight. Default is '#FFFFFF'. */
  lightColor?: string;
  /** The brightness of the specular highlight (0 to 1). Default is 0.75. */
  specularConstant?: number;
  /** The "tightness" or "shininess" of the highlight. Higher values create a smaller, sharper glint. Default is 25. */
  specularExponent?: number;
  /** Custom className for the container */
  className?: string;
  /** Custom styles for the container */
  containerStyle?: React.CSSProperties;
}

// Throttling function to limit the rate of function calls
const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean;
  return function (this: any) {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * A reusable React component that wraps an SVG child and applies a dynamic,
 * interactive specular lighting and spotlight effect on mouse hover.
 */
const DynamicSvgEffect: React.FC<DynamicSvgEffectProps> = ({
  children,
  spotlightSize = 400,
  lightColor = '#FFFFFF',
  specularConstant = 0.75,
  specularExponent = 25,
  className = '',
  containerStyle = {},
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<SVGFEPointLightElement | null>(null);
  const filterId = `dynamic-svg-spotlight-${useId()}`;

  // Validate that the children prop is a single, valid React element.
  if (!React.isValidElement(children)) {
    return null;
  }

  // Throttled mouse move handler to improve performance
  const handleMouseMove = useCallback(
    throttle((e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !lightRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // For performance, we directly manipulate the DOM attributes of the light source
      // and a CSS custom property for the mask instead of triggering React re-renders.
      lightRef.current.setAttribute('x', String(x));
      lightRef.current.setAttribute('y', String(y));
      containerRef.current.style.setProperty('--mouse-x', `${x}px`);
      containerRef.current.style.setProperty('--mouse-y', `${y}px`);
    }, 16), // ~60fps limit
    []
  );

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);
  
  // We need to add our SVG filter to the child component.
  // React.cloneElement is used to achieve this without modifying the original child.
  const child = React.Children.only(children) as React.ReactElement<any>;
  const childWithFilter = React.cloneElement(
    child,
    {
      style: {
        ...(child.props.style || {}),
        filter: `url(#${filterId})`, // Apply the SVG filter
      },
    }
  );

  // The CSS mask creates the "spotlight" effect by making the area around the cursor opaque
  // and the surrounding area transparent. It uses CSS custom properties for mouse position.
  const maskStyle: React.CSSProperties = {
    maskImage: `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`,
    WebkitMaskImage: `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`,
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${styles.container} ${className}`}
      style={{
        // Initialize CSS custom properties
        '--mouse-x': '50%',
        '--mouse-y': '50%',
        ...containerStyle,
      } as React.CSSProperties}
    >
      {/* Base state: The original, unmodified SVG. Visible when not hovering. */}
      <div
        className={styles.baseLayer}
        style={{ opacity: isHovering ? 0 : 1 }}
        aria-hidden={isHovering}
      >
        {children}
      </div>

      {/* Hover state: The enhanced SVG with all effects. Fades in on hover. */}
      <div
        className={styles.effectLayer}
        style={{ 
          opacity: isHovering ? 1 : 0, 
          pointerEvents: isHovering ? 'auto' : 'none' 
        }}
        aria-hidden={!isHovering}
      >
        {/* Layer 1: A faint, full version of the SVG to provide ambient light under the mask. */}
        <div className={styles.ambientLayer}>
          {children}
        </div>
        {/* Layer 2: The main interactive SVG with both the spotlight mask and the specular light filter. */}
        <div className={styles.spotlightLayer} style={maskStyle}>
          {childWithFilter}
        </div>
      </div>
      
      {/* A hidden SVG element to define our complex filter effect. */}
      <svg 
        aria-hidden="true" 
        className={styles.filterDefinition}
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feSpecularLighting 
              in="blur" 
              surfaceScale="3" 
              specularConstant={specularConstant} 
              specularExponent={specularExponent} 
              lightingColor={lightColor} 
              result="specularOut"
            >
              <fePointLight x="0" y="0" z="100" ref={lightRef} />
            </feSpecularLighting>
            <feComposite in="specularOut" in2="SourceAlpha" operator="in" result="specular-clipped" />
            <feComposite 
              in="SourceGraphic" 
              in2="specular-clipped" 
              operator="arithmetic" 
              k1="0" 
              k2="1" 
              k3="0.5" 
              k4="0" 
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default DynamicSvgEffect;