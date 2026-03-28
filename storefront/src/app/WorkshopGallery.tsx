'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRouter } from 'next/navigation';
import SharedSmokeOverlay, { SharedSmokeTarget } from '../components/SharedSmokeOverlay/SharedSmokeOverlay';
import './WorkshopGallery.css';


// Placeholder data - Reverted to original concept as requested (backgrounds are now the theme)
const GALLERY_ITEMS = [
    {
        id: 1,
        title: 'The Divine Craft',
        description: 'Witness the meticulous process of carving raw stone into spiritual energy. Every chisel strike is a mantra, every curve a prayer.',
        videoSrc: '/videos/Candidate_Slowmo_1.mp4',
        config: { x: 60, y: 43, scale: 0.80 }
    },
    {
        id: 2,
        title: 'Master Craftsman',
        description: 'Decades of experience concentrated in a single moment of focus. The workshop hums with the rhythm of creation.',
        videoSrc: '/videos/Candidate_Slowmo_2.mp4',
        config: { x: 48, y: 23, scale: 1.04 }
    },
    {
        id: 3,
        title: 'Legacy of Stone',
        description: 'Generations of knowledge passed down through hands covered in dust. We don\'t just build statues; we preserve history.',
        videoSrc: '/videos/Candidate_Slowmo_3.mp4',
        config: { x: 37, y: 30, scale: 0.77 }
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
        transition: { type: "spring" as const, stiffness: 50, damping: 20 }
    }
};

const imageRevealVariants = {
    hidden: {
        opacity: 0,
        x: 50
    },
    visible: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 1.2,
            ease: [0.22, 1, 0.36, 1] as const,
            delay: 0.1
        }
    }
};

const MAX_RETRIES = 3;
const BASE_STALL_TIMEOUT = 10000; // 10s base, +5s per retry

const VideoDisplay = ({ src, align, config }: { src: string, align: 'left' | 'right', config?: { x: number, y: number, scale: number } }) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [videoSrc, setVideoSrc] = React.useState<string | undefined>(undefined);
    const [retryKey, setRetryKey] = React.useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isVisibleRef = useRef(false);
    const retryCountRef = useRef(0);
    const isLoadingRef = useRef(true);

    const clearStallTimer = useCallback(() => {
        if (stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
        }
    }, []);

    const hardRetry = useCallback(() => {
        if (retryCountRef.current >= MAX_RETRIES) return;
        clearStallTimer();
        retryCountRef.current += 1;
        isLoadingRef.current = true;
        setIsLoading(true);
        setRetryKey(prev => prev + 1);
    }, [clearStallTimer]);

    const startStallTimer = useCallback(() => {
        clearStallTimer();
        const timeout = BASE_STALL_TIMEOUT + (retryCountRef.current * 5000);
        stallTimerRef.current = setTimeout(() => {
            if (isLoadingRef.current) hardRetry();
        }, timeout);
    }, [clearStallTimer, hardRetry]);

    // 1. Lazy loading — load video src when container approaches viewport
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVideoSrc(src);
                observer.disconnect();
            }
        }, { rootMargin: '200px', threshold: 0 });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [src]);

    // 2. Playback control + stall detection
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoSrc) return;

        startStallTimer();

        const playbackObserver = new IntersectionObserver((entries) => {
            isVisibleRef.current = entries[0].isIntersecting;
            if (entries[0].isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }, { threshold: 0.1, rootMargin: '50px' });

        if (containerRef.current) {
            playbackObserver.observe(containerRef.current);
        }

        return () => {
            playbackObserver.disconnect();
            clearStallTimer();
        };
    }, [videoSrc, retryKey, startStallTimer, clearStallTimer]);

    const handleReady = useCallback(() => {
        clearStallTimer();
        isLoadingRef.current = false;
        setIsLoading(false);
        if (isVisibleRef.current && videoRef.current) {
            videoRef.current.play().catch(() => {});
        }
    }, [clearStallTimer]);

    const handleError = useCallback(() => {
        const video = videoRef.current;
        if (video?.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
        hardRetry();
    }, [hardRetry]);

    const handleStalled = useCallback(() => {
        if (isLoadingRef.current) startStallTimer();
    }, [startStallTimer]);

    const position = config ? { x: config.x, y: config.y } : { x: 50, y: 50 };
    const scale = config?.scale || 1;

    return (
        <div
            ref={containerRef}
            className={`gallery-video-wrapper ${align === 'right' ? 'video-align-right' : 'video-align-left'}`}
        >
            {isLoading && (
                <div className="video-loading-spinner">
                    <div className="spinner-ring"></div>
                </div>
            )}

            {videoSrc && (
                <video
                    key={retryKey}
                    ref={videoRef}
                    className={`gallery-video ${isLoading ? 'hidden' : 'visible'}`}
                    src={retryKey > 0 ? `${videoSrc}?retry=${retryKey}` : videoSrc}
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onCanPlayThrough={handleReady}
                    onError={handleError}
                    onStalled={handleStalled}
                    onWaiting={handleStalled}
                    style={{
                        objectPosition: `${position.x}% ${position.y}%`,
                        transform: `scale(${scale})`
                    }}
                />
            )}
            <div className="video-overlay-gradient" />
        </div>
    );
};

export default function WorkshopGallery() {
    const containerRef = useRef<HTMLElement>(null);
    const router = useRouter();
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
                <SharedSmokeOverlay className="shared-smoke-overlay-wrapper">
                    {/* Decorative Mist */}
                    <div className="workshop-gallery-mist" />

                    {/* -- BACKGROUND THEME ARTS -- */}
                    {/* Peacock - Top Left */}
                    <motion.div
                        style={{ y: yPeacock }}
                        className="theme-art-container theme-art-peacock"
                    >
                        <div
                            className="art-mask-wrapper mask-fade-br"
                        >
                            <img
                                src="/theme_images/peacock-art-white.png"
                                alt=""
                                className="theme-image theme-peacock-transform"
                            />
                        </div>
                    </motion.div>

                    {/* Elephant - Center Right */}
                    <motion.div
                        style={{ y: yElephant }}
                        className="theme-art-container theme-art-elephant"
                    >
                        <div
                            className="art-mask-wrapper mask-fade-l"
                        >
                            <img
                                src="/theme_images/elephant-art-white.png"
                                alt=""
                                className="theme-image theme-elephant-transform"
                            />
                        </div>
                    </motion.div>

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
                                    viewport={{ once: true, margin: "-20%" }}
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
                                            style={{ transformOrigin: 'left' }}
                                            variants={{
                                                hidden: { scaleX: 0, opacity: 0 },
                                                visible: { scaleX: 1, opacity: 1, transition: { duration: 0.8, delay: 0.4 } }
                                            }}
                                        >
                                            <SharedSmokeTarget
                                                id={`divider-${item.id}`}
                                                shape="line"
                                                className="gallery-divider-shader"
                                            />
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
                                            onClick={() => router.push('/products')}
                                        >
                                            <span className="gallery-btn-text">
                                                View Arts
                                            </span>
                                            <SharedSmokeTarget
                                                id={`btn-${item.id}`}
                                                shape="button"
                                                className="gallery-btn-shader"
                                                style={{ width: 'auto', height: 'auto' }}
                                            />
                                        </motion.button>
                                    </motion.div>

                                    {/* Visual Column / Video Wrapper */}
                                    <motion.div
                                        className="gallery-visual-col"
                                        variants={imageRevealVariants}
                                    >
                                        <VideoDisplay
                                            src={item.videoSrc}
                                            align={isEven ? 'right' : 'left'}
                                            config={item.config}
                                        />
                                    </motion.div>
                                </motion.div>
                            );
                        })}
                    </div>
                </SharedSmokeOverlay>
            </section>
        </>
    );
}
