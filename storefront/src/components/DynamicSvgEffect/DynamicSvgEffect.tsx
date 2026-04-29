import React, { useState, useRef, useId, useCallback, useEffect } from 'react';
import { useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion';
import styles from './DynamicSvgEffect.module.css';
import { registerWindowSweep } from './windowSweepRegistry';

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
  /**
   * Visual effect preset.
   * - 'specular' (default): cursor-driven white specular highlight.
   * - 'ink': cursor-driven wet-ink bloom (SourceAlpha → red flood → white over).
   * - 'lightsweep': scroll-driven diagonal sweep using the same red-ink filter,
   *   but masked by a linear gradient whose position is bound to the element's
   *   scroll progress through the viewport. The band stays on the art at all
   *   times (no off-canvas excursion). No hover or pointer interaction.
   */
  effect?: 'specular' | 'ink' | 'lightsweep';
  /** Brand red used by the ink and lightsweep effects. Default '#7a1414'. */
  inkColor?: string;
  /** Sweep angle (deg) for `lightsweep`. Default 135. */
  sweepAngle?: number;
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
  effect = 'specular',
  inkColor = '#7a1414',
  sweepAngle = 135,
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
          setIsInViewport(inView);
          if (inView && !hasBeenInViewport) {
            setHasBeenInViewport(true);
          }
        });
      },
      {
        rootMargin: viewportMargin,
        // Single threshold — the previous 7-threshold setup fired callbacks
        // (and React state updates) on every threshold crossing during scroll
        // even though the resolved condition collapsed to `isIntersecting`.
        threshold: 0,
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

  // For lightsweep, "hovering" really means "in viewport" — the sweep mask
  // is positioned by JS based on scroll progress; we just need the
  // effectLayer to be visible (opacity 1) while the art is on-screen.
  useEffect(() => {
    if (effect !== 'lightsweep') return;
    if (isInViewport && !hasBeenInViewport) setHasBeenInViewport(true);
    setIsHovering(isInViewport);
  }, [effect, isInViewport, hasBeenInViewport]);

  // Scroll-driven sweep:
  //   raw progress (from scroll registry) → useSpring (smoothing) → --sweep-pos
  // The spring decouples visual motion from scroll cadence — chunky wheel
  // ticks become a continuous, eased glide. Range [75%, 25%] keeps the
  // band's peak well within the visible window so the band is always
  // substantially on the art.
  const rawSweep = useMotionValue(0.5);
  const smoothSweep = useSpring(rawSweep, { stiffness: 80, damping: 22, mass: 0.7 });

  useEffect(() => {
    if (effect !== 'lightsweep') return;
    const el = containerRef.current;
    if (!el) return;
    return registerWindowSweep({
      el,
      onProgress: (p) => rawSweep.set(p),
    });
  }, [effect, rawSweep]);

  useMotionValueEvent(smoothSweep, 'change', (v) => {
    if (effect !== 'lightsweep') return;
    const el = containerRef.current;
    if (!el) return;
    const pos = 75 - v * 50; // 75% → 25%
    el.style.setProperty('--sweep-pos', `${pos}%`);
  });

  // We need to add our SVG filter to the child component.
  // React.cloneElement is used to achieve this without modifying the original child.
  const child = React.Children.only(children) as React.ReactElement<any>;

  // Only create filtered version if element has been in viewport at least once.
  // For 'lightsweep', skip the SVG filter entirely — the host (PDP bg arts)
  // uses mix-blend-mode: multiply, under which the specular filter's
  // brightening of an already-white-on-transparent PNG saturates to identity
  // (multiply of white = passthrough), so the SVG chain produces no visible
  // contribution. Dropping it eliminates feGaussianBlur + feSpecularLighting +
  // feComposite work per frame on every on-screen art.
  const childWithFilter = hasBeenInViewport ? React.cloneElement(
    child,
    {
      style: {
        ...(child.props.style || {}),
        filter: effect === 'lightsweep' ? 'none' : `url(#${filterId})`,
      },
    }
  ) : null;

  // Mask drives where the filtered child shows through:
  //  - 'specular' / 'ink': cursor-driven radial gradient, position from CSS vars.
  //  - 'lightsweep': fixed-stop linear gradient at sweepAngle°, sized larger
  //    than the layer so an animated mask-position can sweep it diagonally
  //    across the art (CSS keyframe in the .sweepLayer class).
  const maskGradient = (() => {
    if (effect === 'lightsweep') {
      // Tighter, sharper band with deeper shoulders. Stops at 38/45/50/55/62
      // give a ~24% gradient-axis band — narrower than the prior 30% — and
      // 0.65 alpha shoulders make the lead-in/out more saturated, so the
      // sweep reads as a deliberate ink stamp rather than a soft wash.
      return `linear-gradient(${sweepAngle}deg, transparent 0%, transparent 38%, rgba(0,0,0,0.65) 45%, black 50%, rgba(0,0,0,0.65) 55%, transparent 62%, transparent 100%)`;
    }
    if (effect === 'ink') {
      return `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 0%, transparent 100%)`;
    }
    return `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`;
  })();
  const maskStyle: React.CSSProperties = hasBeenInViewport ? (
    effect === 'lightsweep' ? {
      maskImage: maskGradient,
      WebkitMaskImage: maskGradient,
      maskSize: '250% 250%',
      WebkitMaskSize: '250% 250%',
      // no-repeat: avoids the gradient tiling and re-entering from the
      // opposite corner. Mask-position is driven by --sweep-pos via the
      // .sweepLayer class, set per-frame from scroll progress.
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
    } : {
      maskImage: maskGradient,
      WebkitMaskImage: maskGradient,
    }
  ) : {};

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
      {/* Base state: The original art. Always visible for 'lightsweep' (the
          sweep layers on top through a mask). For 'specular' / 'ink' it
          fades out while hovered so the filtered effectLayer takes over. */}
      <div
        className={styles.baseLayer}
        style={{ opacity: effect === 'lightsweep' ? 1 : (isHovering ? 0 : 1) }}
        aria-hidden={effect !== 'lightsweep' && isHovering}
      >
        {children}
      </div>

      {/* Effect layer: filter + mask. Visible while hovering (specular/ink) or
          while in viewport (lightsweep — sweep is time-driven). */}
      {hasBeenInViewport && (
        <div
          className={styles.effectLayer}
          style={{
            opacity: isHovering && isInViewport ? 1 : 0,
            pointerEvents: isHovering && isInViewport && effect !== 'lightsweep' ? 'auto' : 'none'
          }}
          aria-hidden={!isHovering || !isInViewport}
        >
          {/* Ambient layer: faint full art under the mask. Skipped for lightsweep
              so the base layer below shows through fully outside the sweep band. */}
          {effect !== 'lightsweep' && (
            <div className={styles.ambientLayer}>
              {children}
            </div>
          )}
          {/* Masked filter layer. .sweepLayer adds the keyframe animation for lightsweep. */}
          <div
            className={`${styles.spotlightLayer} ${effect === 'lightsweep' ? styles.sweepLayer : ''}`}
            style={maskStyle}
          >
            {childWithFilter}
          </div>
        </div>
      )}

      {/* A hidden SVG element to define our complex filter effect. Only render if needed.
          Skipped for 'lightsweep' since the cloned child uses no SVG filter there. */}
      {hasBeenInViewport && effect !== 'lightsweep' && (
        <svg
          aria-hidden="true"
          className={styles.filterDefinition}
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            {effect === 'ink' ? (
              // INK BLOOM
              // SourceAlpha is the alpha channel of the input — non-zero
              // where lines exist (works for white-on-transparent PNGs and
              // stroked SVGs alike).
              // 1. Gaussian-blur SourceAlpha for the wet-ink bleed.
              // 2. Flood with brand red, intersect with the bleed to get a
              //    red shape only where ink exists.
              // 3. Composite the red ink over a white flood so the surrounding
              //    area is pure white. Under `mix-blend-mode: multiply` on
              //    the wrapper, white = identity (page passes through) and
              //    red × white-page = red lines on the page.
              <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="bleed" />
                <feFlood floodColor={inkColor} floodOpacity={1} result="redFill" />
                <feComposite in="redFill" in2="bleed" operator="in" result="redInk" />
                <feFlood floodColor="#ffffff" floodOpacity={1} result="whiteBg" />
                <feComposite in="redInk" in2="whiteBg" operator="over" />
              </filter>
            ) : (
              // SPECULAR HIGHLIGHT (default)
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
            )}
          </defs>
        </svg>
      )}
    </div>
  );
};

export default DynamicSvgEffect;