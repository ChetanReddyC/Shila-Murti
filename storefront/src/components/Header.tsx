import { FC } from 'react';
import styles from './Header.module.css';

const Header: FC<{ showProgress?: boolean; progress?: number }> = ({ showProgress = false, progress = 0 }) => {
  return (
    <div className="w-full" style={{ height: "100px" }}>
      <header className={styles.header}>
        {/* SVG Filter for Glass Effect */}
        <svg style={{ display: "none" }}>
          <filter
            id="glass-distortion"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.000 0.000"
              numOctaves="1"
              seed="17"
              result="turbulence"
            />
            <feComponentTransfer in="turbulence" result="mapped">
              <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
              <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
              <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
            </feComponentTransfer>
            <feGaussianBlur in="turbulence" stdDeviation="0" result="softMap" />
            <feSpecularLighting
              in="softMap"
              surfaceScale="1"
              specularConstant="1"
              specularExponent="100"
              lightingColor="white"
              result="specLight"
            >
              <fePointLight x="-200" y="-200" z="300" />
            </feSpecularLighting>
            <feComposite
              in="specLight"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
              result="litImage"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softMap"
              scale="200"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>

        {/* Glass layers */}
        <div
          className="absolute inset-0 z-0 overflow-hidden rounded-inherit"
          style={{
            backdropFilter: "blur(2px)",
            filter: "url(#glass-distortion)",
            isolation: "isolate",
          }}
        />
        <div
          className="absolute inset-0 z-10"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            backgroundImage: "linear-gradient(to right, rgba(115,115,115,0.5), rgba(115,115,115,0.5))",
            backgroundSize: `${showProgress ? progress : 0}% 100%`,
            backgroundRepeat: "no-repeat",
            borderRadius: "8px",
            transition: "background-size 0.5s ease",
          }}
        />
        <div
          className="absolute inset-0 z-20 overflow-hidden"
          style={{
            boxShadow:
              "inset 2px 2px 1px 0 rgba(255, 255, 255, 0), inset -1px -1px 1px 1px rgba(255, 255, 255, 0)",
          }}
        />


        {/* Header Content */}
        <div className="relative z-30 flex w-full justify-between items-center">
          {/* Logo/brand */}
          <div className={styles.brandContainer}>
            <h2 className={styles.brand}>Shila Murthi</h2>
          </div>

          <div className="flex items-center">
            {/* Navigation links - hidden on mobile via CSS */}
            <nav className={styles.navContainer}>
              {[
                { label: "Home", href: "/" },
                { label: "Shop", href: "/products" },
                { label: "About", href: "#" },
                { label: "Contact", href: "/contact" },
              ].map((link) => (
                <a
                  key={link.label}
                  className={styles.navLink}
                  href={link.href}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Icons */}
            <div className={styles.iconContainer}>
              {/* Search button */}
              <button className={styles.iconButton} aria-label="Search">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M229.66 218.34l-50.07-50.06a88.11 88.11 0 10-11.31 11.31l50.06 50.07a8 8 0 0011.32-11.32zM40 112a72 72 0 1172 72 72.08 72.08 0 01-72-72z" />
                </svg>
              </button>

              {/* Cart button */}
              <a href="/cart" className={styles.iconButton} aria-label="Cart">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M216 40H40A16 16 0 0024 56v144a16 16 0 0016 16h176a16 16 0 0016-16V56a16 16 0 00-16-16zm0 160H40V56h176zM176 88a48 48 0 01-96 0 8 8 0 0116 0 32 32 0 0064 0 8 8 0 0116 0z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};

export default Header; 