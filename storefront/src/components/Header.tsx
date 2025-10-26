'use client';

import { FC, useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useCart } from '../contexts/CartContext';
import { isOrderConfirmationProtectionActive } from '../utils/orderConfirmationProtection';
import styles from './Header.module.css';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import HeaderGLSLCanvas from './HeaderGLSLCanvas';
import NavLinkShaderOverlay, { type NavLinkShaderOverlayAPI } from './NavLinkShaderOverlay';

const Header: FC<{ showProgress?: boolean; progress?: number }> = ({ showProgress = false, progress = 0 }) => {
  const { getTotalItems, loading: cartLoading, isOrderConfirmationActive } = useCart();
  const { data: session } = useSession();
  const [hydrated, setHydrated] = useState(false);

  const [hasVisitedCart, setHasVisitedCart] = useState<boolean>(false);
  const [isOnCartPage, setIsOnCartPage] = useState<boolean>(false);
  const [isOnOrderConfirmation, setIsOnOrderConfirmation] = useState<boolean>(false);
  const [lastSeenCount, setLastSeenCount] = useState<number>(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const [toggleCount, setToggleCount] = useState<number>(0);
  const navLinkShaderRef = useRef<NavLinkShaderOverlayAPI | null>(null);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isClickInsideNav = target.closest('nav');
      const isClickOnProfileButton = target.closest('[aria-label="User Profile"]');
      if (!isClickInsideNav && !isClickOnProfileButton && isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileMenuOpen]);

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
        >
          <HeaderGLSLCanvas isProfileMenuOpen={isProfileMenuOpen} />
        </div>

        <div className="relative z-30 flex w-full items-center">
          <div className={styles.brandContainer}>
            <h2 className={styles.brand}>Shila Murthi</h2>
          </div>

          <div className={styles.rightSection}>
            <nav className={`${styles.navContainer} ${isProfileMenuOpen ? styles.profileMenuOpen : ''}`}>
              <AnimatePresence mode="wait">
                {!isProfileMenuOpen ? (
                  <motion.div
                    key="navLinks"
                    className={styles.navLinksWrapper}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={{
                      visible: {
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.05
                        }
                      },
                      exit: {
                        transition: {
                          staggerChildren: 0.03,
                          staggerDirection: -1
                        }
                      }
                    }}
                  >
                    {[
                      { label: 'Home', href: '/' },
                      { label: 'Shop', href: '/products' },
                      { label: 'About', href: '#' },
                      { label: 'Contact', href: '/contact' },
                    ].map((link) => (
                      <motion.a
                        key={link.label}
                        className={styles.navLink}
                        href={link.href}
                        onMouseEnter={(e) => navLinkShaderRef.current?.beginHover(e.currentTarget)}
                        onMouseLeave={() => navLinkShaderRef.current?.endHover()}
                        variants={{
                          hidden: {
                            opacity: 0,
                            x: 40,
                            y: -12,
                            scale: 0.85,
                            rotateY: 15,
                            filter: 'blur(4px)'
                          },
                          visible: {
                            opacity: 1,
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotateY: 0,
                            filter: 'blur(0px)',
                            transition: {
                              type: 'spring',
                              stiffness: 350,
                              damping: 20,
                              mass: 0.5,
                              filter: {
                                duration: 0.25,
                                ease: 'easeOut'
                              }
                            }
                          },
                          exit: {
                            opacity: 0,
                            x: -35,
                            y: 10,
                            scale: 0.88,
                            rotateY: -12,
                            filter: 'blur(3px)',
                            transition: {
                              duration: 0.18,
                              ease: [0.6, 0.05, 0.8, 0.95]
                            }
                          }
                        }}
                      >
                        {link.label}
                      </motion.a>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="profileMenu"
                    className={styles.profileMenuWrapper}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={{
                      visible: {
                        transition: {
                          staggerChildren: 0.045,
                          delayChildren: 0.03
                        }
                      },
                      exit: {
                        transition: {
                          staggerChildren: 0.035,
                          staggerDirection: -1
                        }
                      }
                    }}
                  >
                    {[
                      { label: 'Account Details', href: '/account?tab=Account Details' },
                      { label: 'Order History', href: '/account?tab=Order History' },
                      { label: 'Wishlist', href: '/account?tab=Wishlist' },
                      { label: 'Address Book', href: '/account?tab=Address Book' },
                      { label: 'Payment Methods', href: '/account?tab=Payment Methods' },
                      { label: 'Security', href: '/account?tab=Security' },
                    ].map((link) => (
                      <motion.a
                        key={link.label}
                        className={styles.navLink}
                        href={link.href}
                        onClick={() => setIsProfileMenuOpen(false)}
                        onMouseEnter={(e) => navLinkShaderRef.current?.beginHover(e.currentTarget)}
                        onMouseLeave={() => navLinkShaderRef.current?.endHover()}
                        variants={{
                          hidden: {
                            opacity: 0,
                            x: 45,
                            y: -10,
                            scale: 0.82,
                            rotateX: -8,
                            filter: 'blur(5px)'
                          },
                          visible: {
                            opacity: 1,
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotateX: 0,
                            filter: 'blur(0px)',
                            transition: {
                              type: 'spring',
                              stiffness: 380,
                              damping: 22,
                              mass: 0.55,
                              filter: {
                                duration: 0.28,
                                ease: [0.25, 0.1, 0.25, 1]
                              }
                            }
                          },
                          exit: {
                            opacity: 0,
                            x: -40,
                            y: 8,
                            scale: 0.86,
                            rotateX: 8,
                            filter: 'blur(4px)',
                            transition: {
                              duration: 0.16,
                              ease: [0.65, 0, 0.85, 1]
                            }
                          }
                        }}
                      >
                        {link.label}
                      </motion.a>
                    ))}
                    {hydrated && session?.user && (
                      <motion.button
                        className={styles.logoutLink}
                        onMouseEnter={(e) => navLinkShaderRef.current?.beginHover(e.currentTarget)}
                        onMouseLeave={() => navLinkShaderRef.current?.endHover()}
                        variants={{
                          hidden: {
                            opacity: 0,
                            x: 45,
                            y: -10,
                            scale: 0.82,
                            rotateX: -8,
                            filter: 'blur(5px)'
                          },
                          visible: {
                            opacity: 1,
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotateX: 0,
                            filter: 'blur(0px)',
                            transition: {
                              type: 'spring',
                              stiffness: 380,
                              damping: 22,
                              mass: 0.55,
                              filter: {
                                duration: 0.28,
                                ease: [0.25, 0.1, 0.25, 1]
                              }
                            }
                          },
                          exit: {
                            opacity: 0,
                            x: -40,
                            y: 8,
                            scale: 0.86,
                            rotateX: 8,
                            filter: 'blur(4px)',
                            transition: {
                              duration: 0.16,
                              ease: [0.65, 0, 0.85, 1]
                            }
                          }
                        }}
                        onClick={async () => {
                          setIsProfileMenuOpen(false);
                          try {
                            const logoutRes = await fetch('/api/auth/logout', { method: 'POST' });
                            if (typeof window !== 'undefined') {
                              sessionStorage.clear();
                              localStorage.removeItem('medusa_cart_id');
                              localStorage.removeItem('checkout_form');
                              localStorage.removeItem('checkout_identity');
                              localStorage.removeItem('magic_verification_success');
                            }
                            await signOut({ callbackUrl: '/login', redirect: true });
                          } catch (error) {
                            console.error('[LOGOUT] Error:', error);
                          }
                        }}
                      >
                        Logout
                      </motion.button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </nav>

            <div className={styles.iconContainer}>
              <button className={styles.iconButton} aria-label="Search">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M229.66 218.34l-50.07-50.06a88.11 88.11 0 10-11.31 11.31l50.06 50.07a8 8 0 0011.32-11.32zM40 112a72 72 0 1172 72 72.08 72.08 0 01-72-72z" />
                </svg>
              </button>

              <button 
                className={`${styles.iconButton} ${isProfileMenuOpen ? styles.iconButtonActive : ''}`}
                aria-label="User Profile"
                onClick={() => {
                  setIsProfileMenuOpen(!isProfileMenuOpen);
                  setToggleCount(prev => prev + 1);
                }}
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
                  <AnimatePresence>
                    {shouldShowBadge && (
                      <motion.span
                        key="cart-badge"
                        className={`${styles.cartBadge} ${cartLoading ? styles.cartBadgeLoading : ''}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ 
                          duration: 0.3,
                          ease: [0.175, 0.885, 0.32, 1.275]
                        }}
                      >
                        {totalItems}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </a>
            </div>
          </div>
        </div>
      </header>
      <NavLinkShaderOverlay ref={navLinkShaderRef} />
    </div>
  );
};

export default Header;