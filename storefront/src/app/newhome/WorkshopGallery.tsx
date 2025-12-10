'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import ContinuousSmokeShader from '../../components/ContinuousSmokeShader';
import './WorkshopGallery.css';


// Placeholder data - Reverted to original concept as requested (backgrounds are now the theme)
const GALLERY_ITEMS = [
    {
        id: 1,
        title: 'The Divine Craft',
        description: 'Witness the meticulous process of carving raw stone into spiritual energy. Every chisel strike is a mantra, every curve a prayer.',
        type: 'video',
        mediaSrc: '',
        theme: 'light',
    },
    {
        id: 2,
        title: 'Master Craftsman',
        description: 'Decades of experience concentrated in a single moment of focus. The workshop hums with the rhythm of creation.',
        type: 'image',
        mediaSrc: '',
        theme: 'dark',
    },
    {
        id: 3,
        title: 'Legacy of Stone',
        description: 'Generations of knowledge passed down through hands covered in dust. We don\'t just build statues; we preserve history.',
        type: 'video',
        mediaSrc: '',
        theme: 'light',
    },
];

const rowVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.3,
            delayChildren: 0.2,
        }
    }
};

const textStaggerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15
        }
    }
};

const textItemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { type: "spring", stiffness: 50, damping: 20 }
    }
};

const imageRevealVariants = {
    hidden: {
        clipPath: "inset(0% 100% 0% 0%)",
        opacity: 0,
        x: 50
    },
    visible: {
        clipPath: "inset(0% 0% 0% 0%)",
        opacity: 1,
        x: 0,
        transition: {
            duration: 1.2,
            ease: [0.22, 1, 0.36, 1], /* Custom Quint ease */
            delay: 0.1
        }
    }
};

export default function WorkshopGallery() {
    const containerRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"]
    });

    // Parallax Transforms
    const yPeacock = useTransform(scrollYProgress, [0, 1], [0, -100]);
    const yElephant = useTransform(scrollYProgress, [0, 1], [100, -50]);
    const yTemple = useTransform(scrollYProgress, [0, 1], [50, -150]);

    return (
        <>
            <section ref={containerRef} className="workshop-gallery-section">
                {/* Decorative Mist */}
                <div className="workshop-gallery-mist" />

                {/* -- BACKGROUND THEME ARTS -- */}
                {/* Peacock - Top Left */}
                {/* Peacock - Top Left */}
                <motion.div
                    style={{ y: yPeacock }}
                    className="theme-art-container theme-art-peacock"
                >
                    <div
                        className="art-mask-wrapper mask-fade-br"
                    >
                        <img
                            src="/theme_images/peacock%20art%20white.png"
                            alt=""
                            className="theme-image theme-peacock-transform"
                        />
                    </div>
                </motion.div>

                {/* Elephant - Center Right */}
                {/* Elephant - Center Right */}
                <motion.div
                    style={{ y: yElephant }}
                    className="theme-art-container theme-art-elephant"
                >
                    <div
                        className="art-mask-wrapper mask-fade-l"
                    >
                        <img
                            src="/theme_images/Iravathlineart%20white.png"
                            alt=""
                            className="theme-image theme-elephant-transform"
                        />
                    </div>
                </motion.div>

                {/* Temple - Bottom Left */}
                {/* Temple - Bottom Left */}
                <motion.div
                    style={{ y: yTemple }}
                    className="theme-art-container theme-art-temple"
                >
                    <div
                        className="art-mask-wrapper mask-fade-tr"
                    >
                        <img
                            src="/theme_images/templefront-white.png"
                            alt=""
                            className="theme-image theme-temple-transform"
                        />
                    </div>
                </motion.div>

                <div className="workshop-container">
                    {GALLERY_ITEMS.map((item, index) => {
                        const isEven = index % 2 === 0;

                        return (
                            <motion.div
                                key={item.id}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: false, margin: "-20%" }}
                                variants={rowVariants}
                                className={`gallery-item-row ${isEven ? '' : 'reverse'}`}
                            >
                                {/* Text Column */}
                                <motion.div
                                    className="gallery-text-col"
                                    variants={textStaggerVariants}
                                >
                                    <motion.h2
                                        className="gallery-title"
                                        variants={textItemVariants}
                                    >
                                        {item.title}
                                    </motion.h2>
                                    <motion.div
                                        className="gallery-divider-container"
                                        variants={{
                                            hidden: { width: 0, opacity: 0 },
                                            visible: { width: '8rem', opacity: 1, transition: { duration: 0.8, delay: 0.4 } }
                                        }}
                                    >
                                        <ContinuousSmokeShader shape="line" className="gallery-divider-shader" />
                                    </motion.div>
                                    <motion.p
                                        className="gallery-desc"
                                        variants={textItemVariants}
                                    >
                                        {item.description}
                                    </motion.p>

                                    <motion.button
                                        className="gallery-cta-btn"
                                        variants={textItemVariants}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <span className="gallery-btn-text">
                                            View Details
                                        </span>
                                        <ContinuousSmokeShader shape="button" className="gallery-btn-shader" />
                                    </motion.button>
                                </motion.div>

                                {/* Visual Column */}
                                <motion.div
                                    className="gallery-visual-col"
                                    variants={imageRevealVariants}
                                >
                                    {/* "Ice Glow" Backing */}
                                    <div className="gallery-glow-backdrop" />

                                    {/* Media Container - Glassmorphism */}
                                    <div className={`gallery-media-card ${item.theme === 'light' ? 'light-glass' : 'stone-glass'}`}>
                                        {/* Placeholder Content */}
                                        <div className="gallery-placeholder-content">
                                            <div style={{ textAlign: 'center' }}>
                                                <div className="icon-circle">
                                                    <ContinuousSmokeShader shape="circle" className="icon-border-shader" />
                                                    <div className="icon-content">
                                                        {item.type === 'video' ? (
                                                            <svg className="icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="placeholder-label-text">
                                                    {item.type} Placeholder
                                                </p>
                                            </div>
                                        </div>

                                        {/* Real Media Image (Hidden when empty) */}
                                        {item.mediaSrc && (
                                            <img
                                                src={item.mediaSrc}
                                                alt={item.title}
                                                className="gallery-real-img"
                                            />
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
