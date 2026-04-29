'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

/**
 * Initializes Lenis smooth-scroll once at the app root and runs its rAF loop.
 * Renders nothing — purely a side-effectful provider.
 *
 * Notes:
 * - Respects `prefers-reduced-motion: reduce` and skips init for those users.
 * - Lenis dispatches native scroll events as it interpolates, so existing
 *   scroll-linked code (windowSweepRegistry, IntersectionObservers) keeps
 *   working unchanged.
 * - smoothWheel only — touch devices keep native momentum, which feels
 *   better than Lenis-driven smoothing on iOS Safari.
 */
export default function LenisScrollProvider() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    // Expose so overlay components (lightbox, review drawer) can stop/start
    // smooth scroll while open — overflow:hidden alone doesn't stop Lenis's
    // rAF loop, so the page kept scrolling underneath.
    window.__lenis = lenis;

    let rafId = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      if (window.__lenis === lenis) delete window.__lenis;
    };
  }, []);

  return null;
}
