'use client';

import React, { useRef } from 'react';
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
        image: "/images/gallaryscrolimgs/hanumaimage-removebg.png",
        color: "#5D4037", // Earthy Brown
        bgGradient: "linear-gradient(135deg, #e0dcd9 0%, #bdc3c7 100%)"
    },
    {
        id: 2,
        name: "Lord Krishna",
        title: "The Divine Flute",
        material: "Pure White Marble",
        description: "Capturing the playful yet cosmic nature of the divine cowherd. The flow of the dhoti and the stance creates a rhythm in stone.",
        image: "/images/gallaryscrolimgs/krishnaimage-removebg.png",
        color: "#5D4037", // Unified Earthy Brown
        bgGradient: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
    },
    {
        id: 3,
        name: "The Guardian",
        title: "Timeless Grace",
        material: "Sandstone Masterpiece",
        description: "A testament to the chisol's precision. Standing tall through ages, preserving the sanctity of the ancient scriptures.",
        image: "/images/gallaryscrolimgs/statueidol-removebg.png",
        color: "#5D4037", // Unified Earthy Brown
        bgGradient: "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)"
    }
];

const IdolCard = ({ item, onInquire }: { item: typeof IDOLS[0], onInquire: () => void }) => {
    return (
        <div className="idol-card">
            {/* Background Arch/Halo */}
            <div className="idol-halo-container">
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
    const [isPopupOpen, setIsPopupOpen] = React.useState(false);

    const { scrollYProgress } = useScroll({
        target: sectionRef,
        container: containerRef,
        offset: ["start start", "end end"]
    });

    // Horizontal Scroll Logic
    // We map vertical scroll (0 to 1) to horizontal translateX.
    // 3 items => We need to scroll 2 full viewport widths to show all 3.
    // x range: ["0%", "-200vw"] (if we use flex row with 100vw items)
    const x = useTransform(scrollYProgress, [0, 1], ["0%", "-200vw"]);
    const springX = useSpring(x, { stiffness: 100, damping: 30, mass: 0.5 }); // Smooth out the scroll

    return (
        <section ref={sectionRef} className="idol-scroll-section">
            <div className="idol-sticky-wrapper">
                {/* Horizontal Track */}
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
