'use client';

import React from 'react';
import { useScrollAnimation } from '../../../hooks/useScrollAnimation';
import styles from './ProductDetailPage.module.css';

const FeaturesSection: React.FC = () => {
  // Use the scroll animation hook for the title with a delay
  const titleAnimation = useScrollAnimation({
    threshold: 0.2,
    rootMargin: '0px 0px -100px 0px',
  });

  // Use the scroll animation hook for each feature card with a delay
  const feature1Animation = useScrollAnimation({
    threshold: 0.2,
    rootMargin: '0px 0px -100px 0px',
  });

  const feature2Animation = useScrollAnimation({
    threshold: 0.2,
    rootMargin: '0px 0px -100px 0px',
  });

  const feature3Animation = useScrollAnimation({
    threshold: 0.2,
    rootMargin: '0px 0px -100px 0px',
  });

  return (
    <>
      <h3
        ref={titleAnimation.elementRef as React.RefObject<HTMLHeadingElement>}
        className={`text-center text-2xl font-bold mb-8 text-[#141414] transition-all duration-700 ${titleAnimation.isVisible ? 'opacity-100 transform-none' : 'opacity-0 translate-y-10 blur-[4px]'}`}
        style={{
          transitionDelay: titleAnimation.isVisible ? '0ms' : '0ms'
        }}
      >
        Why Shop With Us
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        {/* Feature 1 - Quality Guarantee */}
        <div
          ref={feature1Animation.elementRef as React.RefObject<HTMLDivElement>}
          className={`flex items-center gap-3 p-3 rounded-2xl border border-[#f0f0f0] transition-all duration-700 ${styles.featuresDivs}`}
          style={{
            transitionProperty: 'opacity, transform, filter, box-shadow',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: feature1Animation.isVisible ? '1100ms' : '0ms',
            opacity: feature1Animation.isVisible ? 1 : 0,
            transform: feature1Animation.isVisible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
            filter: feature1Animation.isVisible ? 'blur(0)' : 'blur(8px)',
            boxShadow: feature1Animation.isVisible ? '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)'
          }}
        >
          <div className="w-16 h-16 bg-gradient-to-br from-[#141414] to-[#333333] rounded-2xl flex items-center justify-center shadow-lg transition-all duration-1000 hover:scale-110"
            style={{
              animation: feature1Animation.isVisible ? 'pulseGlow 3s infinite' : 'none',
              opacity: feature1Animation.isVisible ? 1 : 0,
              transform: feature1Animation.isVisible ? 'translateX(0) scale(1)' : 'translateX(calc(50% - 32px)) scale(0.8) rotate(45deg)',
              filter: feature1Animation.isVisible ? 'blur(0)' : 'blur(8px)',
              transitionDelay: feature1Animation.isVisible ? '1150ms' : '0ms',
              transformOrigin: 'center center',
              transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              position: feature1Animation.isVisible ? 'relative' : 'absolute',
              left: feature1Animation.isVisible ? 'auto' : '50%',
              top: feature1Animation.isVisible ? 'auto' : '50%',
              marginLeft: feature1Animation.isVisible ? '0' : '-32px'
            }}>

            <svg className="w-8 h-8 text-white transition-transform duration-1000 hover:rotate-12"
              style={{
                opacity: feature1Animation.isVisible ? 1 : 0,
                transform: feature1Animation.isVisible ? 'rotate(0)' : 'rotate(180deg) scale(0.5)',
                transitionDelay: feature1Animation.isVisible ? '1200ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                transformOrigin: 'center center'
              }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className={`transition-all duration-700 ${feature1Animation.isVisible ? 'opacity-100 transform-none filter-none' : 'opacity-0 translate-y-6 blur-[4px]'}`}
            style={{ transitionDelay: feature1Animation.isVisible ? '1250ms' : '0ms' }}>
            <h4 className="text-[#141414] font-bold leading-tight mb-2">Quality Guarantee</h4>
            <p className="text-[#6b7280] text-sm leading-relaxed">30-day return policy</p>
          </div>
        </div>

        {/* Feature 2 - Fast Shipping */}
        <div
          ref={feature2Animation.elementRef as React.RefObject<HTMLDivElement>}
          className={`flex items-center gap-4 p-4 bg-white rounded-2xl border border-[#f0f0f0] transition-all duration-700 ${styles.featuresDivs}`}
          style={{
            transitionProperty: 'opacity, transform, filter, box-shadow',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: feature2Animation.isVisible ? '1300ms' : '0ms',
            opacity: feature2Animation.isVisible ? 1 : 0,
            transform: feature2Animation.isVisible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
            filter: feature2Animation.isVisible ? 'blur(0)' : 'blur(8px)',
            boxShadow: feature2Animation.isVisible ? '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)'
          }}
        >
          <div className="w-16 h-16 bg-gradient-to-br from-[#141414] to-[#333333] rounded-2xl flex items-center justify-center shadow-lg transition-all duration-1000 hover:scale-110"
            style={{
              animation: feature2Animation.isVisible ? 'pulseGlow 3s infinite' : 'none',
              opacity: feature2Animation.isVisible ? 1 : 0,
              transform: feature2Animation.isVisible ? 'translateX(0) scale(1)' : 'translateX(calc(50% - 32px)) scale(0.8) rotate(45deg)',
              filter: feature2Animation.isVisible ? 'blur(0)' : 'blur(8px)',
              transitionDelay: feature2Animation.isVisible ? '1350ms' : '0ms',
              transformOrigin: 'center center',
              transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              position: feature2Animation.isVisible ? 'relative' : 'absolute',
              left: feature2Animation.isVisible ? 'auto' : '50%',
              top: feature2Animation.isVisible ? 'auto' : '50%',
              marginLeft: feature2Animation.isVisible ? '0' : '-32px'
            }}>

            <svg className="w-8 h-8 text-white transition-transform duration-1000 hover:rotate-12"
              style={{
                opacity: feature2Animation.isVisible ? 1 : 0,
                transform: feature2Animation.isVisible ? 'rotate(0)' : 'rotate(180deg) scale(0.5)',
                transitionDelay: feature2Animation.isVisible ? '1400ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                transformOrigin: 'center center'
              }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className={`transition-all duration-700 ${feature2Animation.isVisible ? 'opacity-100 transform-none filter-none' : 'opacity-0 translate-y-6 blur-[4px]'}`}
            style={{ transitionDelay: feature2Animation.isVisible ? '1450ms' : '0ms' }}>
            <h4 className="text-[#141414] text-lg font-bold leading-tight mb-2">Fast Shipping</h4>
            <p className="text-[#6b7280] text-sm leading-relaxed">2-3 business days</p>
          </div>
        </div>

        {/* Feature 3 - 24/7 Support */}
        <div
          ref={feature3Animation.elementRef as React.RefObject<HTMLDivElement>}
          className={`flex items-center gap-4 p-4 bg-white rounded-2xl border border-[#f0f0f0] transition-all duration-700 ${styles.featuresDivs}`}
          style={{
            transitionProperty: 'opacity, transform, filter, box-shadow',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: feature3Animation.isVisible ? '1500ms' : '0ms',
            opacity: feature3Animation.isVisible ? 1 : 0,
            transform: feature3Animation.isVisible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
            filter: feature3Animation.isVisible ? 'blur(0)' : 'blur(8px)',
            boxShadow: feature3Animation.isVisible ? '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)'
          }}
        >
          <div className="w-16 h-16 bg-gradient-to-br from-[#141414] to-[#333333] rounded-2xl flex items-center justify-center shadow-lg transition-all duration-1000 hover:scale-110"
            style={{
              animation: feature3Animation.isVisible ? 'pulseGlow 3s infinite' : 'none',
              opacity: feature3Animation.isVisible ? 1 : 0,
              transform: feature3Animation.isVisible ? 'translateX(0) scale(1)' : 'translateX(calc(50% - 32px)) scale(0.8) rotate(45deg)',
              filter: feature3Animation.isVisible ? 'blur(0)' : 'blur(8px)',
              transitionDelay: feature3Animation.isVisible ? '1550ms' : '0ms',
              transformOrigin: 'center center',
              transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              position: feature3Animation.isVisible ? 'relative' : 'absolute',
              left: feature3Animation.isVisible ? 'auto' : '50%',
              top: feature3Animation.isVisible ? 'auto' : '50%',
              marginLeft: feature3Animation.isVisible ? '0' : '-32px'
            }}>

            <svg className="w-8 h-8 text-white transition-transform duration-1000 hover:rotate-12"
              style={{
                opacity: feature3Animation.isVisible ? 1 : 0,
                transform: feature3Animation.isVisible ? 'rotate(0)' : 'rotate(180deg) scale(0.5)',
                transitionDelay: feature3Animation.isVisible ? '1600ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                transformOrigin: 'center center'
              }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className={`transition-all duration-700 ${feature3Animation.isVisible ? 'opacity-100 transform-none filter-none' : 'opacity-0 translate-y-6 blur-[4px]'}`}
            style={{ transitionDelay: feature3Animation.isVisible ? '1650ms' : '0ms' }}>
            <h4 className="text-[#141414] text-lg font-bold leading-tight mb-2">24/7 Support</h4>
            <p className="text-[#6b7280] text-sm leading-relaxed">Customer service</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default FeaturesSection;