'use client';

import { FC, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useCart } from '../contexts/CartContext';
import { isOrderConfirmationProtectionActive } from '../utils/orderConfirmationProtection';
import styles from './Header.module.css';
import LogoutButton from './LogoutButton';

const Header: FC<{ showProgress?: boolean; progress?: number }> = ({ showProgress = false, progress = 0 }) => {
  const { getTotalItems, loading: cartLoading, isOrderConfirmationActive } = useCart();
  const { data: session } = useSession();
  const [hydrated, setHydrated] = useState(false);

  const [hasVisitedCart, setHasVisitedCart] = useState<boolean>(false);
  const [isOnCartPage, setIsOnCartPage] = useState<boolean>(false);
  const [isOnOrderConfirmation, setIsOnOrderConfirmation] = useState<boolean>(false);
  const [lastSeenCount, setLastSeenCount] = useState<number>(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHydrated(true);

    try {
      const visited = window.sessionStorage.getItem('hasVisitedCart') === 'true';
      setHasVisitedCart(visited);
      const storedLastSeen = Number(window.sessionStorage.getItem('cartLastSeenCount') || '0');
      setLastSeenCount(Number.isFinite(storedLastSeen) ? storedLastSeen : 0);
    } catch {}

    const updateRouteState = () => {
      const path = window.location.pathname || '';
      Promise.resolve().then(() => {
        setIsOnCartPage(path === '/cart' || path.startsWith('/cart/'));
        setIsOnOrderConfirmation(path.startsWith('/order-confirmation'));
      });
    };

    updateRouteState();
    const onPopState = () => updateRouteState();
    window.addEventListener('popstate', onPopState);
    const onNextNav = () => updateRouteState();
    window.addEventListener('next-router-navigation', onNextNav as EventListener);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('next-router-navigation', onNextNav as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isOnCartPage) {
      try {
        Promise.resolve().then(() => {
          window.sessionStorage.setItem('hasVisitedCart', 'true');
          const currentCount = getTotalItems();
          window.sessionStorage.setItem('cartLastSeenCount', String(currentCount));
          setLastSeenCount(currentCount);
          if (!hasVisitedCart) setHasVisitedCart(true);
        });
      } catch {}
    }
  }, [isOnCartPage, hasVisitedCart, getTotalItems]);

  const protectionActive = hydrated ? (isOrderConfirmationActive() || isOrderConfirmationProtectionActive()) : false;
  const preventCartNavigation = hydrated ? (isOnOrderConfirmation || protectionActive) : false;
  const totalItems = preventCartNavigation ? 0 : getTotalItems();
  const shouldShowBadge = hasVisitedCart && !isOnCartPage && totalItems > lastSeenCount;

  return (
    <div className="w-full" style={{ height: '100px' }}>
      <header className={styles.header}>
        <svg style={{ display: 'none' }}>
          <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.000 0.000" numOctaves="1" seed="17" result="turbulence" />
            <feComponentTransfer in="turbulence" result="mapped">
              <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
              <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
              <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
            </feComponentTransfer>
            <feGaussianBlur in="turbulence" stdDeviation="0" result="softMap" />
            <feSpecularLighting in="softMap" surfaceScale="1" specularConstant="1" specularExponent="100" lightingColor="white" result="specLight">
              <fePointLight x="-200" y="-200" z="300" />
            </feSpecularLighting>
            <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
            <feDisplacementMap in="SourceGraphic" in2="softMap" scale="200" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>

        <div
          className="absolute inset-0 z-0 overflow-hidden rounded-inherit"
          style={{ backdropFilter: 'blur(2px)', filter: 'url(#glass-distortion)', isolation: 'isolate' }}
        />
        <div
          className="absolute inset-0 z-10"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            backgroundImage: 'linear-gradient(to right, rgba(115,115,115,0.5), rgba(115,115,115,0.5))',
            backgroundSize: `${showProgress ? progress : 0}% 100%`,
            backgroundRepeat: 'no-repeat',
            borderRadius: '8px',
            transition: 'background-size 0.5s ease',
          }}
        />
        <div
          className="absolute inset-0 z-20 overflow-hidden"
          style={{ boxShadow: 'inset 2px 2px 1px 0 rgba(255, 255, 255, 0), inset -1px -1px 1px 1px rgba(255, 255, 255, 0)' }}
        />

        <div className="relative z-30 flex w-full justify-between items-center">
          <div className={styles.brandContainer}>
            <h2 className={styles.brand}>Shila Murthi</h2>
          </div>

          <div className="flex items-center">
            <nav className={`${styles.navContainer} ${isProfileMenuOpen ? styles.profileMenuOpen : ''}`}>
              <div className={`${styles.navLinksWrapper} ${isProfileMenuOpen ? styles.fadeOut : styles.fadeIn}`}>
                {[
                  { label: 'Home', href: '/' },
                  { label: 'Shop', href: '/products' },
                  { label: 'About', href: '#' },
                  { label: 'Contact', href: '/contact' },
                ].map((link) => (
                  <a key={link.label} className={styles.navLink} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
              <div className={`${styles.profileMenuWrapper} ${isProfileMenuOpen ? styles.fadeIn : styles.fadeOut}`}>
                {[
                  { label: 'Account Details', href: '#' },
                  { label: 'Order History', href: '#' },
                  { label: 'Wishlist', href: '#' },
                  { label: 'Address Book', href: '#' },
                  { label: 'Payment Methods', href: '#' },
                  { label: 'Security', href: '#' },
                ].map((link) => (
                  <a key={link.label} className={styles.navLink} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </nav>

            {hydrated && session?.user && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ marginRight: 12, color: '#141414', fontSize: 14 }}>
                  {session.user.email || session.user.name || session.user.phone || 'Signed in'}
                </div>
                <LogoutButton />
              </div>
            )}

            <div className={styles.iconContainer}>
              <button className={styles.iconButton} aria-label="Search">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M229.66 218.34l-50.07-50.06a88.11 88.11 0 10-11.31 11.31l50.06 50.07a8 8 0 0011.32-11.32zM40 112a72 72 0 1172 72 72.08 72.08 0 01-72-72z" />
                </svg>
              </button>

              <button 
                className={styles.iconButton} 
                aria-label="User Profile"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M230.92 212c-15.23-26.33-38.7-45.21-66.09-54.16a72 72 0 10-73.66 0C63.78 166.79 40.31 185.67 25.08 212a8 8 0 1013.85 8c18.84-32.56 52.14-52 89.07-52s70.23 19.44 89.07 52a8 8 0 1013.85-8zM72 96a56 56 0 1156 56 56.06 56.06 0 01-56-56z" />
                </svg>
              </button>

              <a
                href={preventCartNavigation ? '#' : '/cart'}
                onClick={(e) => {
                  if (preventCartNavigation) {
                    e.preventDefault();
                    return false;
                  }
                }}
                className={`${styles.iconButton} ${styles.cartButton} ${preventCartNavigation ? styles.cartButtonDisabled : ''}`}
                aria-label={`Cart (${totalItems} items)`}
                title={preventCartNavigation ? 'Cart is temporarily disabled after order completion.' : 'Open cart'}
              >
                <div className={styles.cartIconContainer}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M216 40H40A16 16 0 0024 56v144a16 16 0 0016 16h176a16 16 0 0016-16V56a16 16 0 00-16-16zm0 160H40V56h176zM176 88a48 48 0 01-96 0 8 8 0 0116 0 32 32 0 0064 0 8 8 0 0116 0z" />
                  </svg>
                  {shouldShowBadge && (
                    <span className={`${styles.cartBadge} ${cartLoading ? styles.cartBadgeLoading : ''}`}>{totalItems}</span>
                  )}
                </div>
              </a>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};

export default Header;