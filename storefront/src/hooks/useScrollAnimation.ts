'use client';

import { useEffect, useRef, useState } from 'react';

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * A hook that detects when an element enters the viewport and triggers animations
 * @param options Configuration options for the Intersection Observer
 * @returns An object containing the ref to attach to the element and whether it's visible
 */
export const useScrollAnimation = (options: UseScrollAnimationOptions = {}) => {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true
  } = options;

  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref to handle dynamic element mounting
  const elementRef = (node: HTMLElement | null) => {
    setElement(node);
  };

  useEffect(() => {
    if (!element) return;

    // Cleanup previous observer if it exists
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);

          // If triggerOnce is true, disconnect the observer after the element becomes visible
          if (triggerOnce && observerRef.current) {
            observerRef.current.disconnect();
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [element, threshold, rootMargin, triggerOnce]);

  return { elementRef, isVisible };
};