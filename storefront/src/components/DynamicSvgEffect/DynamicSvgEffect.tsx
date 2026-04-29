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
   * - 'spotlight': scroll-driven curved-rim spotlight reveal. A wide soft
   *   radial pool of "key light" travels along ONE side of the element,
   *   following a sin-bowed bezier-style path from top to bottom (with a
   *   slight off-frame overshoot at both ends). Its center is bound to the
   *   element's scroll progress through the viewport; the spring smoothes
   *   chunky scroll deltas. No SVG filter, no hover, no pointer interaction.
   */
  effect?: 'specular' | 'ink' | 'spotlight';
  /** Brand red used by the ink effect. Default '#7a1414'. */
  inkColor?: string;
  /** Which rim of the element the spotlight hugs. Default 'right'. */
  rimSide?: 'left' | 'right';
  /**
   * Inward bulge of the arc at its apex (% of element width). The trajectory
   * is a true semicircle parameterized as x = anchor ± R·sin(πp), y = 50 −
   * R·cos(πp); `archDepth` is the horizontal R, `archHeight` the vertical R.
   * Default 55 — apex pushes well past the element's centre, so the arch
   * shape is unmistakable even under a wide spot pool.
   */
  archDepth?: number;
  /**
   * Vertical extent of the arc (% of element height). 50 = arc spans the full
   * height (top to bottom). <50 keeps the spot away from the very edges.
   * Default 50.
   */
  archHeight?: number;
  /** Horizontal radius of the spotlight pool (% of element width). Default 55. */
  spotRadiusX?: number;
  /** Vertical radius of the spotlight pool (% of element height). Default 38. */
  spotRadiusY?: number;
  /** CSS filter applied to the revealed (spotlit) copy of the art. */
  spotlightFilter?: string;
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
  rimSide = 'right',
  archDepth = 55,
  archHeight = 100,
  spotRadiusX = 55,
  spotRadiusY = 38,
  spotlightFilter,
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

  // For spotlight, "hovering" really means "in viewport" — the radial mask
  // center is positioned by JS based on scroll progress; we just need the
  // effectLayer to be visible (opacity 1) while the art is on-screen.
  useEffect(() => {
    if (effect !== 'spotlight') return;
    if (isInViewport && !hasBeenInViewport) setHasBeenInViewport(true);
    setIsHovering(isInViewport);
  }, [effect, isInViewport, hasBeenInViewport]);

  // Scroll-driven spotlight position:
  //   raw progress (from scroll registry) → useSpring (smoothing) → --spot-x/--spot-y
  // The spring decouples visual motion from scroll cadence — chunky wheel
  // ticks become a continuous, eased glide. Path is computed from progress
  // in the listener below.
  const rawSweep = useMotionValue(0.5);
  const smoothSweep = useSpring(rawSweep, { stiffness: 80, damping: 22, mass: 0.7 });

  useEffect(() => {
    if (effect !== 'spotlight') return;
    const el = containerRef.current;
    if (!el) return;
    return registerWindowSweep({
      el,
      onProgress: (p) => rawSweep.set(p),
    });
  }, [effect, rawSweep]);

  useMotionValueEvent(smoothSweep, 'change', (p) => {
    if (effect !== 'spotlight') return;
    const el = containerRef.current;
    if (!el) return;
    // True semicircular-arch trajectory (parameterized by θ = π·p):
    //   x = anchorX ± archDepth · sin(θ)
    //   y = 50 − archHeight · cos(θ)
    // At p=0: spot at top of the rim (anchorX, 50−archHeight) — i.e., the
    //         top-right corner of the bbox for rimSide='right', top-left
    //         for 'left'.
    // At p=0.5: spot at the arc's apex (anchorX + sign·archDepth, 50) — the
    //          point pushed furthest inward, away from the rim.
    // At p=1: spot at bottom of the rim (anchorX, 50+archHeight) — i.e.,
    //         the corresponding bottom corner.
    // anchorX is pushed past the rim, with the whole curve nudged rightward
    // for both rim sides. archHeight (100) means y at p=0 lands at -50%
    // (well above the bbox) and at p=1 at 150% (well below) — spot enters
    // from far off-frame above the rim, arcs deeply through the interior,
    // exits far off-frame below. The entry/exit beats are pronounced: the
    // art is genuinely dim for a stretch of scroll before the spot crosses
    // its top edge, and again after it leaves the bottom edge.
    const anchorX = rimSide === 'right' ? 112 : 8;
    const sign = rimSide === 'right' ? -1 : 1;
    const theta = Math.PI * p;
    const x = anchorX + sign * archDepth * Math.sin(theta);
    const y = 50 - archHeight * Math.cos(theta);
    el.style.setProperty('--spot-x', `${x}%`);
    el.style.setProperty('--spot-y', `${y}%`);
  });

  // We need to add our SVG filter to the child component.
  // React.cloneElement is used to achieve this without modifying the original child.
  const child = React.Children.only(children) as React.ReactElement<any>;

  // Only create filtered version if element has been in viewport at least once.
  // For 'spotlight', skip the SVG filter entirely — the host (PDP bg arts)
  // uses mix-blend-mode: multiply, under which an SVG specular-style filter's
  // brightening of an already-white-on-transparent PNG saturates to identity
  // (multiply of white = passthrough), so the SVG chain produces no visible
  // contribution. Instead, the consumer passes `spotlightFilter` (a plain CSS
  // filter string) which is applied inline to the cloned img — that's how the
  // spotlit copy gets its vivid, fully-revealed look while the dim base copy
  // keeps the consumer's barely-there CSS filter via cascade.
  const childWithFilter = hasBeenInViewport ? React.cloneElement(
    child,
    {
      style: {
        ...(child.props.style || {}),
        filter: effect === 'spotlight'
          ? (spotlightFilter ?? 'none')
          : `url(#${filterId})`,
        // For spotlight the consumer's CSS may dim the base img via opacity
        // (so the un-spotlit area reads as a ghost). The revealed copy must
        // ignore that dimming — pin it to full opacity so the pool of light
        // produces a clear reveal regardless of the base styling.
        ...(effect === 'spotlight' ? { opacity: 1 } : {}),
      },
    }
  ) : null;

  // Mask drives where the filtered child shows through:
  //  - 'specular' / 'ink': cursor-driven radial gradient, position from CSS vars.
  //  - 'spotlight': scroll-driven elliptical pool whose center is driven by
  //    --spot-x/--spot-y (set per frame from scroll progress along a curved
  //    rim path). Wide, strong core with a long, soft falloff to transparent
  //    so the reveal reads as a key light rather than a hard-edged disc.
  const maskGradient = (() => {
    if (effect === 'spotlight') {
      return `radial-gradient(ellipse ${spotRadiusX}% ${spotRadiusY}% at var(--spot-x, 50%) var(--spot-y, 50%), black 0%, rgba(0,0,0,0.92) 22%, rgba(0,0,0,0.6) 46%, rgba(0,0,0,0.22) 70%, transparent 92%)`;
    }
    if (effect === 'ink') {
      return `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 0%, transparent 100%)`;
    }
    return `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), black 40%, transparent 100%)`;
  })();
  const maskStyle: React.CSSProperties = hasBeenInViewport ? (
    effect === 'spotlight' ? {
      maskImage: maskGradient,
      WebkitMaskImage: maskGradient,
      // No tiling: the gradient is sized to the element and positioned by
      // the radial-gradient's own `at <x> <y>` — we don't drive mask-position.
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
      {/* Base state: The original art. Always visible for 'spotlight' (the
          spotlit copy layers on top through the radial mask). For 'specular'
          / 'ink' it fades out while hovered so the filtered effectLayer takes
          over. */}
      <div
        className={styles.baseLayer}
        style={{ opacity: effect === 'spotlight' ? 1 : (isHovering ? 0 : 1) }}
        aria-hidden={effect !== 'spotlight' && isHovering}
      >
        {children}
      </div>

      {/* Effect layer: filter + mask. Visible while hovering (specular/ink) or
          while in viewport (spotlight — center is scroll-driven). */}
      {hasBeenInViewport && (
        <div
          className={styles.effectLayer}
          style={{
            opacity: isHovering && isInViewport ? 1 : 0,
            pointerEvents: isHovering && isInViewport && effect !== 'spotlight' ? 'auto' : 'none'
          }}
          aria-hidden={!isHovering || !isInViewport}
        >
          {/* Ambient layer: faint full art under the mask. Skipped for spotlight
              so the dim base layer below shows through fully outside the pool. */}
          {effect !== 'spotlight' && (
            <div className={styles.ambientLayer}>
              {children}
            </div>
          )}
          {/* Masked filter layer. */}
          <div
            className={styles.spotlightLayer}
            style={maskStyle}
          >
            {childWithFilter}
          </div>
        </div>
      )}

      {/* A hidden SVG element to define our complex filter effect. Only render if needed.
          Skipped for 'spotlight' since the cloned child uses a plain CSS filter. */}
      {hasBeenInViewport && effect !== 'spotlight' && (
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