'use client';

import React, { useRef, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import ContinuousSmokeShader from '../components/ContinuousSmokeShader';
import ComingSoonPopup from '../components/ComingSoonPopup';
import './IdolScrollGallery.css';

const IDOLS = [
    {
        id: 1,
        name: "Lord Hanuman",
        title: "Strength & Devotion",
        material: "Black Granite Stone",
        description: "An embodiment of infinite strength and selfless service. Notice the intricate muscle detailing and the expression of sublime devotion.",
        image: "/images/idols/hanuman.png",
        color: "#5D4037", // Earthy Brown
        bgGradient: "linear-gradient(135deg, #e0dcd9 0%, #bdc3c7 100%)"
    },
    {
        id: 2,
        name: "Lord Krishna",
        title: "The Divine Flute",
        material: "Black Granite Stone",
        description: "Capturing the playful yet cosmic nature of the divine cowherd. The flow of the dhoti and the stance creates a rhythm in stone.",
        image: "/images/idols/krishna.png",
        color: "#5D4037", // Unified Earthy Brown
        bgGradient: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
    },
    {
        id: 3,
        name: "The Guardian",
        title: "Timeless Grace",
        material: "Black Granite Stone",
        description: "A testament to the chisol's precision. Standing tall through ages, preserving the sanctity of the ancient scriptures.",
        image: "/images/idols/statue.png",
        color: "#5D4037", // Unified Earthy Brown
        bgGradient: "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)"
    }
];

const IdolCard = ({ item, onInquire }: { item: typeof IDOLS[0], onInquire: () => void }) => {
    return (
        <div className="idol-card">
            {/* Background Arch/Halo */}
            <div className="idol-halo-container">
                <motion.div
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                    animate={{
                        y: [0, -14, 0]
                    }}
                    transition={{
                        duration: 5,
                        ease: "easeInOut",
                        repeat: Infinity
                    }}
                >
                    {/* Drawn Circle Animation */}
                    <motion.svg
                        className="idol-halo-svg"
                        viewBox="0 0 100 100"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: false, amount: 0.5 }}
                    >
                        <motion.circle
                            cx="50"
                            cy="50"
                            r="49"
                            stroke={item.color}
                            strokeWidth="0.5"
                            strokeOpacity="0.4"
                            fill="transparent"
                            variants={{
                                hidden: { pathLength: 0, opacity: 0 },
                                visible: {
                                    pathLength: 1,
                                    opacity: 1,
                                    transition: { duration: 2, ease: "easeInOut" }
                                }
                            }}
                        />
                    </motion.svg>

                    <div className="idol-halo-inner" style={{ background: item.color + '20' }} />
                </motion.div>
            </div>

            {/* Content Container */}
            <div className="idol-content-grid">

                {/* Visual Side (Image) */}
                <div className="idol-visual-side">
                    <motion.div
                        className="idol-image-wrapper"
                        whileInView={{ scale: 1.05 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        viewport={{ once: false, amount: 0.3 }}
                    >
                        {/* Shadow underneath - Breathing animation */}
                        <motion.div
                            className="idol-shadow"
                            animate={{
                                scaleX: [1, 0.85, 1],
                                opacity: [0.6, 0.3, 0.6]
                            }}
                            transition={{
                                duration: 5,
                                ease: "easeInOut",
                                repeat: Infinity
                            }}
                        />
                        {/* Floating Idol */}
                        <motion.img
                            src={item.image}
                            alt={item.name}
                            className="idol-image"
                            animate={{
                                y: [0, -14, 0]
                            }}
                            transition={{
                                duration: 5,
                                ease: "easeInOut",
                                repeat: Infinity
                            }}
                        />
                    </motion.div>
                </div>

                {/* Text Side */}
                <div className="idol-text-side">
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="idol-info-box"
                    >
                        <span className="idol-subtitle" style={{ color: item.color }}>{item.material}</span>
                        <h2 className="idol-title">{item.title}</h2>
                        <h3 className="idol-name-tag">{item.name}</h3>
                        <p className="idol-description">{item.description}</p>

                        <button className="idol-cta-btn" onClick={onInquire}>
                            <span className="btn-text">Inquire Now</span>
                            <div className="idol-btn-divider-container">
                                <ContinuousSmokeShader shape="line" className="idol-btn-divider-shader" />
                            </div>
                        </button>
                    </motion.div>
                </div>
            </div>

            {/* Floating Aesthetics (Particles/Shader) */}
            <div className="idol-atmosphere">
                <ContinuousSmokeShader shape="circle" className="idol-bg-smoke" style={{ opacity: 0.3 }} />
            </div>
        </div>
    );
};

export default function IdolScrollGallery({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
    const sectionRef = useRef<HTMLElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isPopupOpen, setIsPopupOpen] = React.useState(false);

    const { scrollYProgress } = useScroll({
        target: sectionRef,
        container: containerRef,
        offset: ["start start", "end end"]
    });

    // Horizontal Scroll Logic
    // We map vertical scroll (0 to 1) to horizontal translateX.
    // 3 items => We need to scroll 2 full viewport widths to show all 3.
    const x = useTransform(scrollYProgress, [0, 1], ["0%", "-200vw"]);
    const springX = useSpring(x, { stiffness: 100, damping: 30, mass: 0.5 });

    // Horizontal swipe/drag → vertical scroll conversion
    // Converts left/right swipe gestures into vertical scroll of the container,
    // which the existing scroll→transform pipeline picks up automatically.
    useEffect(() => {
        const wrapper = wrapperRef.current;
        const container = containerRef.current;
        const section = sectionRef.current;
        if (!wrapper || !container || !section) return;

        const DIRECTION_LOCK_THRESHOLD = 10; // px before locking direction

        // Ratio: how many vertical scroll pixels per horizontal swipe pixel
        const getScrollMultiplier = () => {
            const scrollRange = section.offsetHeight - window.innerHeight;
            const trackRange = 2 * window.innerWidth; // 200vw
            return scrollRange / trackRange;
        };

        // --- Touch handling (mobile) ---
        let touchState: {
            startX: number;
            startY: number;
            startScrollTop: number;
            locked: 'horizontal' | 'vertical' | null;
        } | null = null;

        const onTouchStart = (e: TouchEvent) => {
            touchState = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                startScrollTop: container.scrollTop,
                locked: null
            };
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!touchState) return;
            const dx = e.touches[0].clientX - touchState.startX;
            const dy = e.touches[0].clientY - touchState.startY;

            // Lock direction after threshold
            if (!touchState.locked) {
                if (Math.abs(dx) + Math.abs(dy) < DIRECTION_LOCK_THRESHOLD) return;
                touchState.locked = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
            }

            if (touchState.locked === 'horizontal') {
                e.preventDefault();
                // Swipe left (negative dx) → scroll down → next slide
                container.scrollTop = touchState.startScrollTop - dx * getScrollMultiplier();
            }
            // Vertical swipes pass through to browser (existing scroll behavior)
        };

        const onTouchEnd = () => { touchState = null; };

        // --- Mouse drag (desktop) ---
        let mouseState: {
            startX: number;
            startScrollTop: number;
        } | null = null;

        const onMouseDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('button, a, input')) return;
            mouseState = {
                startX: e.clientX,
                startScrollTop: container.scrollTop
            };
            wrapper.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!mouseState) return;
            const dx = e.clientX - mouseState.startX;
            if (Math.abs(dx) > 5) {
                container.scrollTop = mouseState.startScrollTop - dx * getScrollMultiplier();
            }
        };

        const onMouseUp = () => {
            mouseState = null;
            wrapper.style.cursor = '';
        };

        // --- Horizontal wheel/trackpad (desktop) ---
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 1) {
                e.preventDefault();
                container.scrollTop += e.deltaX * getScrollMultiplier();
            }
        };

        wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
        wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
        wrapper.addEventListener('touchend', onTouchEnd);
        wrapper.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        wrapper.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            wrapper.removeEventListener('touchstart', onTouchStart);
            wrapper.removeEventListener('touchmove', onTouchMove);
            wrapper.removeEventListener('touchend', onTouchEnd);
            wrapper.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            wrapper.removeEventListener('wheel', onWheel);
        };
    }, [containerRef]);

    return (
        <section ref={sectionRef} className="idol-scroll-section">
            <div ref={wrapperRef} className="idol-sticky-wrapper">
                <motion.div
                    className="idol-horizontal-track"
                    style={{ x: springX }}
                >
                    {IDOLS.map((item) => (
                        <div key={item.id} className="idol-slide">
                            <IdolCard item={item} onInquire={() => setIsPopupOpen(true)} />
                        </div>
                    ))}
                </motion.div>
            </div>

            <ComingSoonPopup isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
        </section>
    );
}
