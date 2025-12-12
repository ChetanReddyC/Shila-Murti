'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ContinuousSmokeShader from './ContinuousSmokeShader';
import './ComingSoonPopup.css';

interface ComingSoonPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ComingSoonPopup({ isOpen, onClose }: ComingSoonPopupProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="popup-backdrop"
                    />

                    {/* Popup Card - Styled like Idol Card */}
                    <motion.div
                        className="popup-card"
                        initial={{ opacity: 0, scale: 0.9, y: 20, x: '-50%', top: '50%', left: '50%' }}
                        animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%', top: '50%', left: '50%' }}
                        exit={{ opacity: 0, scale: 0.9, y: 20, x: '-50%', top: '50%', left: '50%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        {/* Background subtle effect */}
                        <div className="popup-bg-glow" />

                        {/* Top Random Mist (Barely Visible) */}
                        <div className="popup-mist-top">
                            <ContinuousSmokeShader shape="circle" className="popup-mist-shader" style={{ opacity: 0.4 }} />
                        </div>

                        {/* Top Right Close X */}
                        <button onClick={onClose} className="popup-close-x" aria-label="Close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                        <div className="popup-content">
                            {/* Title Section matching Idol Gallery */}
                            <h2 className="popup-title">Namaste</h2>
                            <h3 className="popup-subtitle">Thank You for Your Interest</h3>

                            {/* Smoke Divider */}
                            <div className="popup-divider-container">
                                <ContinuousSmokeShader shape="line" className="popup-divider-shader" />
                            </div>

                            <p className="popup-message">
                                We are truly delighted to have you here. <br />
                                We have currently launched this webstore for you to
                                <span className="popup-highlight"> experience and explore our art catalogue</span>.
                                <br />
                                <span className="popup-subtext">Full operations commencing soon.</span>
                            </p>

                            {/* Close Button - Matching 'Inquire Now' style */}
                            <button onClick={onClose} className="popup-cta-btn">
                                <span className="btn-text">Close</span>
                                <div className="popup-btn-divider-container">
                                    <ContinuousSmokeShader shape="line" className="popup-btn-divider-shader" />
                                </div>
                            </button>
                        </div>

                        {/* Bottom Mist Effect */}
                        <div className="popup-mist-container">
                            <ContinuousSmokeShader shape="circle" className="popup-mist-shader" style={{ opacity: 0.8 }} />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
