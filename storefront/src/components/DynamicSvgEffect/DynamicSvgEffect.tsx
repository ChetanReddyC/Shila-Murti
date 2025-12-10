import React, { useState, useRef, useId, useCallback, useEffect } from 'react';
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
  /** Enable viewport culling for performance. Default is true. */
  enableViewportCulling?: boolean;
  /** Margin around viewport for intersection observer. Default is '100px'. */
  viewportMargin?: string;
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
  enableViewportCulling = true,
  viewportMargin = '100px',
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isInViewport, setIsInViewport] = useState(!enableViewportCulling); // If culling disabled, always in viewport
  const [hasBeenInViewport, setHasBeenInViewport] = useState(false); // Track if element has ever been visible
  const containerRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<SVGFEPointLightElement | null>(null);
  const filterId = `dynamic-svg-spotlight-${useId()}`;

  // Set up Intersection Observer for viewport culling
  useEffect(() => {
    if (!enableViewportCulling || !containerRef.current) return;

    // Calculate appropriate threshold based on element size
    // For larger elements, require more visibility before activating
    const calculateThreshold = () => {
      if (!containerRef.current) return 0.01;
      const rect = containerRef.current.getBoundingClientRect();
      const elementHeight = rect.height;
      const viewportHeight = window.innerHeight;

      // If element is larger than viewport, require at least 20% visibility
      if (elementHeight > viewportHeight) {
        return 0.2;
      }
      // For medium sized elements, 10% visibility
      if (elementHeight > viewportHeight * 0.5) {
        return 0.1;
      }
      // For small elements, 1% is fine
      return 0.01;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const inView = entry.isIntersecting;
          // Additional check: for large elements, ensure significant intersection
          const significantlyVisible = entry.intersectionRatio > 0.15;
          const shouldActivate = inView && (entry.intersectionRatio < 0.2 || significantlyVisible);

          setIsInViewport(shouldActivate);

          // Track if element has ever been visible (for lazy loading)
          if (shouldActivate && !hasBeenInViewport) {
            setHasBeenInViewport(true);
          }
        });
      },
      {
        rootMargin: viewportMargin,
        threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0], // Multiple thresholds for better detection
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enableViewportCulling, viewportMargin, hasBeenInViewport]);

  // Validate that the children prop is a single, valid React element.
  if (!React.isValidElement(children)) {
    return null;
  }

  // Throttled mouse move handler to improve performance
  const handleMouseMove = useCallback(
    throttle((e: React.MouseEvent<HTMLDivElement>) => {
      // Skip shader calculations if not in viewport
      if (!isInViewport) return;
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
    [isInViewport]
  );

  const handleMouseEnter = () => {
    // Only enable hover if in viewport
    if (isInViewport) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Clean up hover state when leaving viewport
  useEffect(() => {
    if (!isInViewport && isHovering) {
      setIsHovering(false);
    }
  }, [isInViewport, isHovering]);

  // We need to add our SVG filter to the child component.
  // React.cloneElement is used to achieve this without modifying the original child.
  const child = React.Children.only(children) as React.ReactElement<any>;

  // Only create filtered version if element has been in viewport at least once
  const childWithFilter = hasBeenInViewport ? React.cloneElement(
    child,
    {
      style: {
        ...(child.props.style || {}),
        filter: `url(#${filterId})`, // Apply the SVG filter
      },
    }
  ) : null;

  // The CSS mask creates the "spotlight" effect by making the area around the cursor opaque
  // and the surrounding area transparent. It uses CSS custom properties for mouse position.
  const maskStyle: React.CSSProperties = hasBeenInViewport ? {
    maskImage: `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`,
    WebkitMaskImage: `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`,
  } : {};

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

      {/* Hover state: The enhanced SVG with all effects. Only render if element has been visible. */}
      {hasBeenInViewport && (
        <div
          className={styles.effectLayer}
          style={{
            opacity: isHovering && isInViewport ? 1 : 0,
            pointerEvents: isHovering && isInViewport ? 'auto' : 'none'
          }}
          aria-hidden={!isHovering || !isInViewport}
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
      )}

      {/* A hidden SVG element to define our complex filter effect. Only render if needed. */}
      {hasBeenInViewport && (
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
      )}
    </div>
  );
};

export default DynamicSvgEffect;