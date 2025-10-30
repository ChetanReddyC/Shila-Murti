'use client';

import { useEffect, useState, useRef, createContext, useContext } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import LoadingScreen from '@/components/LoadingScreen';

interface NavigationLoadingContextType {
  showLoading: () => void;
  hideLoading: () => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType | null>(null);

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext);
  if (!context) {
    return {
      showLoading: () => {},
      hideLoading: () => {}
    };
  }
  return context;
}

export default function NavigationLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const previousPathRef = useRef(pathname);

  const showLoading = () => setIsLoading(true);
  const hideLoading = () => setIsLoading(false);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (link && link.href) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        if (url.origin === currentUrl.origin && url.pathname !== currentUrl.pathname) {
          setIsLoading(true);
        }
      }
      
      const button = target.closest('button');
      if (button && button.type === 'button') {
        const onClick = button.getAttribute('onclick');
        if (onClick?.includes('router.push') || onClick?.includes('navigate')) {
          setIsLoading(true);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      previousPathRef.current = pathname;
      return;
    }

    if (pathname !== previousPathRef.current) {
      previousPathRef.current = pathname;
      
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams, isInitialLoad]);

  return (
    <NavigationLoadingContext.Provider value={{ showLoading, hideLoading }}>
      <LoadingScreen
        show={isLoading}
        duration={1200}
        imagesFolder="/loading-animations"
        shaderEffect="smoke"
        onComplete={() => setIsLoading(false)}
      />
      {children}
    </NavigationLoadingContext.Provider>
  );
}
