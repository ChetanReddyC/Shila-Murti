'use client';

import styles from './page.module.css';
import GLSLCanvas from '../components/GLSLCanvas';
import DynamicSvgEffect from '../components/DynamicSvgEffect';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const heroes = [
    {
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDhueADB8ZtBUYTHeeqKcelefoBApqLPbZ-2m9ggoHGf4MriDJ00W3nc-Nd9apu1pe50qXwMnjKcybXilTnWVAZuUxuC7Uqgr6QUq031Z6SwW9ffES0sHmt0Fj4IlikSx0km5mqjAmVM6zmU90rHwi-5NqPpWdBphgfYjz1OJSuzjGUa10Q3BRPMxhAW8CDyJcY5OktxWcPiyZ-24dQTfH03NsapHGav3fyli1FuX6WEssUIEw6f0yFTGnbE8s0FzQfP7w3kIAttzWr",
      title: "Discover the Timeless Beauty of Stone Idols",
      subtitle: "Explore our curated collection of handcrafted stone idols, each a unique work of art.",
    },
    {
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBza2aC2ynjO_Cjf626h87aSOt6g514Cu9YBGndKOWhwbAekyy-xbM6E8VJD2ty8pE71ZLBb20yel8lueRTviCFy-mB8xfQ49iarJ5aQHf83SgOvx7_kKvu8rajfW8YA3ce7YRXJ3a75oRWg1A5yBKCOR1dpc0pq8pJQKPAPJAdAHUnvrDQu2SCsjYM5EowTheFW4ObmvSzO9cU8YRjUEQi1yXSm-b2N7gM36zuui0yAemwzteOBZ2tMHb6JlVtQfU50hz6R7MUAKYP",
      title: "Divine Deities Collection",
      subtitle: "Sacred stone idols of gods and goddesses.",
    },
    {
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBGuVXBEdwxEBhOsezPu5hI80kb916JNPwnjmENG3ZjFKtctuY-5HEY01Zmt-w8L3D_aoJ6BA6YOi8VXOf9s2EhMFdlQAdwVv14JeIPgFZiM89QsJ8khyiGn0WFIk03lHcTlwQPnYVspBNPgEo4OVZAg9d6evt0qZ6OKrf5GizWSAS1JjDgQyqlD2JN1UiUSZIPJl-9wjAPI7EI6PD85Yur1CRrbzLIbTXEwdiChNzrjOSnoKZi8xU6vk9QYM442UOTL56KymUBbwhc",
      title: "Majestic Animal Sculptures",
      subtitle: "Stone carvings inspired by nature's creatures.",
    },
    {
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCGjv1a_PR8Jhg3tiabrTUC9d0RRLIci59mEHHL7Bv4Aub5Tag0vgvmZ2x39fTQOUJX--rUdB-kVUf5A51MBre0kf88rpIRv8UAGqsiKkJbBDEAZIfjk4FTVBGCz0andy95SIRQY2Kj_lmptrIRw43lzpmzhCbY-8tMiowiztlEc6RuQMmEnIbtbIL9w1QhjTu5FCTNQMDM8O3d9dvGgYuWW9gS1GoJKWDTAbvi-PSKg0cHeZXsAi_-M96zvCezziY1YaXLnaPAE8go",
      title: "Abstract Stone Art",
      subtitle: "Modern and contemporary stone designs.",
    },
    {
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDhueADB8ZtBUYTHeeqKcelefoBApqLPbZ-2m9ggoHGf4MriDJ00W3nc-Nd9apu1pe50qXwMnjKcybXilTnWVAZuUxuC7Uqgr6QUq031Z6SwW9ffES0sHmt0Fj4IlikSx0km5mqjAmVM6zmU90rHwi-5NqPpWdBphgfYjz1OJSuzjGUa10Q3BRPMxhAW8CDyJcY5OktxWcPiyZ-24dQTfH03NsapHGav3fyli1FuX6WEssUIEw6f0yFTGnbE8s0FzQfP7w3kIAttzWr",
      title: "Timeless Masterpieces",
      subtitle: "Handcrafted stone idols for your space.",
    },
  ];

  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  // Shader is always active now; removed debug toggle logic that caused flicker
  const shaderActive = true;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => {
        let next = prev + direction;
        if (next >= heroes.length) {
          setDirection(-1);
          next = heroes.length - 2;
        } else if (next < 0) {
          setDirection(1);
          next = 1;
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [direction]);

  const slideRef = useRef(null);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      // Swipe left
      setCurrentSlide((prev) => Math.min(prev + 1, heroes.length - 1));
    }
    if (touchStart - touchEnd < -75) {
      // Swipe right
      setCurrentSlide((prev) => Math.max(prev - 1, 0));
    }
    setDirection(0); // Pause auto-slide on manual interaction
  };

  return (
    <div className="relative w-full overflow-hidden" style={{ paddingTop: '100px' }}>
      <div
        className="relative min-h-screen w-full bg-white"
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        {/* Removed debug indicator */}

        <div className="w-full flex justify-center bg-white pt-12">
          <div className="flex h-full grow flex-col w-full max-w-[1280px] px-4 sm:px-6 mx-auto">
            {/* First decorative SVG - with standard viewport detection */}
            <div className={styles.shaderWrapper} style={{ zIndex: 5 }}>
              <DynamicSvgEffect
                spotlightSize={400}
                lightColor="#FFFFFF"
                specularConstant={0.75}
                specularExponent={25}
                enableViewportCulling={true}
                viewportMargin="50px"  // Standard margin for first SVG
              >
                <img 
                  src="/svg-art1.svg" 
                  alt="Decorative art" 
                  style={{
                    height: '100%',
                    width: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </DynamicSvgEffect>
            </div>
            
            {/* Main content */}
            <div className="flex flex-1 w-full">
              <div className="flex flex-col w-full">
                {/* Hero section */}
                <div className="w-full mt-6">
                  <div className={styles.heroCarousel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    ref={slideRef}
                  >
                    
                    <div className={styles.heroSlides} style={{ transform: `translateX(-${currentSlide * 100}%)`, transition: 'transform 0.5s ease' }}>
                      {heroes.map((hero, index) => (
                        <div key={index} className={styles.hero}>
                          <img 
                            src={hero.img} 
                            alt={hero.title} 
                            className={styles.heroImage}
                            loading={index === 0 ? "eager" : "lazy"}
                          />
                          <div className={styles.heroContent}>
                            <h1 className={styles.heroTitle}>
                              {hero.title}
                            </h1>
                            <p className={styles.heroSubtitle}>
                              {hero.subtitle}
                            </p>
                            <button className={styles.shopButton}>
                              Shop Now
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={styles.heroDots}>
                      {heroes.map((_, index) => (
                        <span
                          key={index}
                          className={`${styles.heroDot} ${currentSlide === index ? styles.active : ''}`}
                          onClick={() => setCurrentSlide(index)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <GLSLCanvas />
                {/* Featured collections - responsive grid handled by CSS */}
                <div className="mt-16 sm:mt-20">
                  <h2 className={styles.sectionTitle}>
                    Featured Collections
                  </h2>
                  <div className={styles.collectionGrid}>
                  {[
                    {
                      label: "Deities",
                      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBza2aC2ynjO_Cjf626h87aSOt6g514Cu9YBGndKOWhwbAekyy-xbM6E8VJD2ty8pE71ZLBb20yel8lueRTviCFy-mB8xfQ49iarJ5aQHf83SgOvx7_kKvu8rajfW8YA3ce7YRXJ3a75oRWg1A5yBKCOR1dpc0pq8pJQKPAPJAdAHUnvrDQu2SCsjYM5EowTheFW4ObmvSzO9cU8YRjUEQi1yXSm-b2N7gM36zuui0yAemwzteOBZ2tMHb6JlVtQfU50hz6R7MUAKYP",
                    },
                    {
                      label: "Animals",
                      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBGuVXBEdwxEBhOsezPu5hI80kb916JNPwnjmENG3ZjFKtctuY-5HEY01Zmt-w8L3D_aoJ6BA6YOi8VXOf9s2EhMFdlQAdwVv14JeIPgFZiM89QsJ8khyiGn0WFIk03lHcTlwQPnYVspBNPgEo4OVZAg9d6evt0qZ6OKrf5GizWSAS1JjDgQyqlD2JN1UiUSZIPJl-9wjAPI7EI6PD85Yur1CRrbzLIbTXEwdiChNzrjOSnoKZi8xU6vk9QYM442UOTL56KymUBbwhc",
                    },
                    {
                      label: "Abstract",
                      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCGjv1a_PR8Jhg3tiabrTUC9d0RRLIci59mEHHL7Bv4Aub5Tag0vgvmZ2x39fTQOUJX--rUdB-kVUf5A51MBre0kf88rpIRv8UAGqsiKkJbBDEAZIfjk4FTVBGCz0andy95SIRQY2Kj_lmptrIRw43lzpmzhCbY-8tMiowiztlEc6RuQMmEnIbtbIL9w1QhjTu5FCTNQMDM8O3d9dvGgYuWW9gS1GoJKWDTAbvi-PSKg0cHeZXsAi_-M96zvCezziY1YaXLnaPAE8go",
                    },
                  ].map((collection) => (
                      <div key={collection.label} className="flex flex-col cursor-pointer w-80 ">
                        <div className="overflow-hidden rounded-lg">
                          <img 
                            src={collection.img} 
                            alt={collection.label} 
                            className={styles.collectionImage}
                            loading="lazy"
                          />
                        </div>
                        <p className={styles.collectionTitle}>
                          {collection.label}
                        </p>
                      </div>
                  ))}
                  </div>
                </div>

                {/* Second decorative SVG - Restored with shader effects */}
                <div className={styles.shaderWrapperSecond} style={{ zIndex: 0 }}>
                  <DynamicSvgEffect
                    spotlightSize={400}
                    lightColor="#FFFFFF"
                    specularConstant={0.75}
                    specularExponent={25}
                    enableViewportCulling={true}
                    viewportMargin="50px"
                    containerStyle={{
                      maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%)',
                    }}
                  >
                    <img 
                      src="/violene11.png" 
                      alt="Decorative art" 
                      style={{
                        height: '100%',
                        width: 'auto',
                        objectFit: 'fill',
                      }}
                    />
                  </DynamicSvgEffect>
                </div>

                {/* Footer - responsive styles handled by CSS */}
                <footer className={styles.footer}>
                  <div className={styles.footerLinks}>
                    {[
                      { label: "About Us", href: "#" },
                      { label: "Contact", href: "#" },
                      { label: "Terms of Service", href: "#" },
                    ].map((link) => (
                      <a
                        key={link.label}
                        className={styles.footerLink}
                        href={link.href}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <p className={styles.footerCopyright}>
                    © 2024 Shila Murthi. All rights reserved.
                  </p>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
