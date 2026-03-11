'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ContinuousSmokeShader from './ContinuousSmokeShader';
import styles from './ComingSoonPopup.module.css';

interface ComingSoonPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ComingSoonPopup({ isOpen, onClose }: ComingSoonPopupProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={styles.overlay}
                    onClick={onClose}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.8, 0.25, 1] }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Top mist shader */}
                        <div className={styles.mistTop}>
                            <ContinuousSmokeShader shape="circle" className={styles.mistShader} style={{ opacity: 0.4 }} />
                        </div>

                        {/* Close button */}
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className={styles.content}>
                            <h3 className={styles.title}>Namaste</h3>
                            <p className={styles.subtitle}>Thank You for Your Interest</p>

                            {/* Smoke divider */}
                            <div className={styles.dividerContainer}>
                                <ContinuousSmokeShader shape="line" className={styles.dividerShader} />
                            </div>

                            <p className={styles.message}>
                                We are truly delighted to have you here.<br />
                                We have currently launched this webstore for you to
                                <span className={styles.highlight}> experience and explore our art catalogue</span>.
                                <span className={styles.subtext}>Full operations commencing soon.</span>
                            </p>

                            <button onClick={onClose} className={styles.ctaBtn}>
                                <span className={styles.btnText}>Close</span>
                                <div className={styles.btnDividerContainer}>
                                    <ContinuousSmokeShader shape="line" className={styles.btnDividerShader} />
                                </div>
                            </button>
                        </div>

                        {/* Bottom mist shader */}
                        <div className={styles.mistBottom}>
                            <ContinuousSmokeShader shape="circle" className={styles.mistShader} style={{ opacity: 0.8 }} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
