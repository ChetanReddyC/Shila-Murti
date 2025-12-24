'use client';

import React from 'react';
import styles from './ProductDetailPage.module.css';
import reviewStyles from './ReviewsSection.module.css';
import { useScrollAnimation } from '../../../hooks/useScrollAnimation';

interface Review {
  id: string;
  author: string;
  rating: number; // 1-5
  date: string; // ISO or human-readable
  content: string;
  variant?: string;
}

const mockReviews: Review[] = [
  {
    id: 'r1',
    author: 'Aarav Sharma',
    rating: 5,
    date: '2024-11-12',
    content:
      'Outstanding craftsmanship and attention to detail. The finish is immaculate and it feels premium. Highly recommended!',
    variant: 'Standard',
  },
  {
    id: 'r2',
    author: 'Meera Patel',
    rating: 4,
    date: '2024-12-04',
    content:
      'Beautiful piece, arrived well-packed. The texture and colors are exactly as shown. Shipping was quick too.',
    variant: 'Large',
  },
  {
    id: 'r3',
    author: 'Rohit Verma',
    rating: 5,
    date: '2025-01-18',
    content:
      'Exceeded expectations. It has a lovely presence and blends perfectly with our decor. Will buy again.',
  },
];

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${filled ? 'text-[#141414]' : 'text-[#d1d5db]'}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={filled ? 0 : 2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.974a1 1 0 00.95.69h4.178c.969 0 1.371 1.24.588 1.81l-3.382 2.458a1 1 0 00-.364 1.118l1.287 3.974c.3.922-.755 1.688-1.54 1.118l-3.382-2.458a1 1 0 00-1.175 0l-3.382 2.458c-.784.57-1.838-.196-1.539-1.118l1.286-3.974a1 1 0 00-.364-1.118L2.997 9.401c-.783-.57-.38-1.81.588-1.81h4.178a1 1 0 00.95-.69l1.286-3.974z"
      />
    </svg>
  );
}

const ReviewsSection: React.FC = () => {
  const titleAnim = useScrollAnimation({ threshold: 0.2, rootMargin: '0px 0px -100px 0px' });
  const summaryAnim = useScrollAnimation({ threshold: 0.2, rootMargin: '0px 0px -100px 0px' });

  const cardsAnims = mockReviews.map(() =>
    useScrollAnimation({ threshold: 0.15, rootMargin: '0px 0px -100px 0px' })
  );

  const average =
    mockReviews.length > 0
      ? Math.round(
        (mockReviews.reduce((acc, r) => acc + r.rating, 0) / mockReviews.length) * 10
      ) / 10
      : 0;

  return (
    <section
      className="mt-32 md:mt-40 lg:mt-48 pt-4"
      aria-labelledby="reviews-title"
    >
      {/* Section header aligned left, matching page intro hierarchy */}
      <div className="flex flex-col items-start text-left mb-16 md:mb-20 max-w-5xl gap-3 md:gap-3">
        <h3
          id="reviews-title"
          ref={titleAnim.elementRef as React.RefObject<HTMLHeadingElement>}
          className={`tracking-tight text-[34px] md:text-[42px] lg:text-[52px] font-bold leading-[1.1] text-[#141414] transition-all duration-300 ${titleAnim.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
        >
          What Customers Say
        </h3>
        {/* Subtitle wrapped to allow absolute/relative fine control */}
        <div className="relative w-full">
          <p className={reviewStyles.subtitle}>
            Real experiences from people who bought this product.
          </p>
        </div>

        {/* Rating summary emphasizes left alignment like price row */}
        <div
          ref={summaryAnim.elementRef as React.RefObject<HTMLDivElement>}
          className="flex items-center gap-6 md:gap-8 mt-2"
          style={{
            transition: 'opacity 250ms, transform 250ms',
            opacity: summaryAnim.isVisible ? 1 : 0,
            transform: summaryAnim.isVisible ? 'translateY(0)' : 'translateY(4px)',
          }}
        >
          <span className="text-[#141414] text-3xl md:text-4xl font-bold leading-tight tabular-nums">
            {average.toFixed(1)} / 5
          </span>
          <div className="flex" aria-label={`${average} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} filled={i <= Math.round(average)} />
            ))}
          </div>
          <span className="text-[#6b7280] text-base md:text-lg">
            {mockReviews.length} {mockReviews.length === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        {/* Subtle bottom line aligned left */}
        <div className="mt-10 md:mt-12 w-full">
          <div className="h-px w-40 md:w-64 bg-gradient-to-r from-[#e5e7eb] to-transparent"></div>
        </div>
      </div>

      {/* Reviews grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-16 xl:gap-20">
        {mockReviews.map((r, idx) => {
          const anim = cardsAnims[idx];
          return (
            <article
              key={r.id}
              ref={anim.elementRef as React.RefObject<HTMLDivElement>}
              className={`px-6 py-6 md:px-7 md:py-7 rounded-2xl border border-[#f0f0f0] bg-white ${styles.featuresDivs} transition-all duration-500`}
              style={{
                transitionProperty: 'opacity, transform, filter, box-shadow',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDelay: anim.isVisible ? `${200 + idx * 150}ms` : '0ms',
                opacity: anim.isVisible ? 1 : 0,
                transform: anim.isVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.99)',
                filter: anim.isVisible ? 'blur(0)' : 'blur(4px)',
              }}
            >
              <header className="mb-5 md:mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#141414] to-[#333333] flex items-center justify-center text-white text-base md:text-lg font-semibold shadow-md"
                    aria-hidden="true"
                    style={{ animation: anim.isVisible ? 'pulseGlow 3s infinite' : 'none' }}
                  >
                    {r.author.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-[#141414] text-lg md:text-[20px] font-semibold leading-tight tracking-[-0.01em]">
                      {r.author}
                    </h4>
                    <p className="text-[#6b7280] text-sm md:text-[15px] leading-relaxed">
                      {new Date(r.date).toLocaleDateString()}
                      {r.variant ? ` • ${r.variant}` : ''}
                    </p>
                  </div>
                </div>
              </header>

              <div className="mb-5 md:mb-6 flex items-center gap-3">
                <div className="flex" aria-label={`${r.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} filled={i <= r.rating} />
                  ))}
                </div>
                <span className="text-[#141414] text-base md:text-lg font-semibold tabular-nums">
                  {r.rating}.0
                </span>
              </div>

              <p className="text-[#141414] text-[15px] md:text-[16px] leading-7 md:leading-8 tracking-[-0.01em]">
                {r.content}
              </p>
            </article>
          );
        })}
      </div>

      {/* Anchor target for write review (placeholder) */}
      <div id="write-review" className="sr-only" aria-hidden="true" />
    </section>
  );
};

export default ReviewsSection;
