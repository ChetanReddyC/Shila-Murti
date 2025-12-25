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
  {
    id: 'r4',
    author: 'Priya Singh',
    rating: 5,
    date: '2025-01-20',
    content:
      'Absolutely love it! The detailing on the idol is intricate and beautiful. It brings such a positive vibe to my home.',
    variant: 'Standard',
  },
  {
    id: 'r5',
    author: 'Karan Mehta',
    rating: 4,
    date: '2025-01-25',
    content:
      'Good quality product. Heavier than I expected, which is nice. Packaging could be slightly better but item was safe.',
  },
];

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`${reviewStyles.starIcon} ${filled ? reviewStyles.starFilled : reviewStyles.starEmpty}`}
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
  const [isExpanded, setIsExpanded] = React.useState(false);



  const average =
    mockReviews.length > 0
      ? Math.round(
        (mockReviews.reduce((acc, r) => acc + r.rating, 0) / mockReviews.length) * 10
      ) / 10
      : 0;

  // State to lock height for seamless transition
  const [fixedHeight, setFixedHeight] = React.useState<number | undefined>(undefined);
  // Scroll the new items into view when expanded
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isExpanded && gridRef.current) {
      const grid = gridRef.current;
      const firstNewItem = grid.children[3] as HTMLElement;

      if (firstNewItem) {
        // Scroll to specifically align the first new review at the top
        // using requestAnimationFrame ensures layout is ready
        requestAnimationFrame(() => {
          grid.scrollTo({ top: firstNewItem.offsetTop - 12, behavior: 'smooth' });
        });
      }
    }
  }, [isExpanded]);

  const toggleExpand = () => {
    if (!isExpanded) {
      // Expanding: Lock the current height to prevent layout shift
      if (gridRef.current) {
        setFixedHeight(gridRef.current.offsetHeight);
      }
      setIsExpanded(true);
    } else {
      // Collapsing: Reset to auto height
      setIsExpanded(false);
      setFixedHeight(undefined);
      if (gridRef.current) {
        gridRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const visibleReviews = isExpanded ? mockReviews : mockReviews.slice(0, 3);

  return (
    <section
      className={reviewStyles.reviewsSection}
      aria-labelledby="reviews-title"
    >
      {/* ... header code ... */}
      <div className={reviewStyles.headerContainer}>
        {/* ... (keep existing header content, omitting for brevity in tool call if not replacing) ... */}
        <h3
          id="reviews-title"
          className={reviewStyles.title}
        >
          What Customers Say
        </h3>
        <div className={reviewStyles.subtitleWrapper}>
          <p className={reviewStyles.subtitle}>
            Real experiences from people who bought this product.
          </p>
        </div>
        <div
          className={reviewStyles.summaryRow}
        >
          <span className={reviewStyles.summaryRating}>{average.toFixed(1)} / 5</span>
          <div className={reviewStyles.starsContainer} aria-label={`${average} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (<Star key={i} filled={i <= Math.round(average)} />))}
          </div>
          <span className={reviewStyles.reviewCount}>{mockReviews.length} {mockReviews.length === 1 ? 'review' : 'reviews'}</span>
        </div>
      </div>

      {/* Reviews Stack */}
      <div
        ref={gridRef}
        className={`${reviewStyles.reviewsGrid} ${isExpanded ? reviewStyles.reviewsGridExpanded : ''}`}
        style={{ height: isExpanded && fixedHeight ? `${fixedHeight}px` : undefined }}
      >
        {visibleReviews.map((r, idx) => {
          return (
            <article
              key={r.id}
              className={reviewStyles.reviewCard}
            >
              <header className={reviewStyles.cardHeader}>
                <div className={reviewStyles.authorMeta}>
                  <h4 className={reviewStyles.authorName}>{r.author}</h4>
                  <div className={reviewStyles.subMeta}>
                    <div className={reviewStyles.starsContainer}>
                      {[1, 2, 3, 4, 5].map((i) => (<Star key={i} filled={i <= r.rating} />))}
                    </div>
                    <span className={reviewStyles.dateString}>
                      • {r.variant ? `${r.variant}, ` : ''}{new Date(r.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </header>
              <p className={reviewStyles.reviewContent}>{r.content}</p>
            </article>
          );
        })}
      </div>

      {/* Bottom Toggle Button sitting on border */}
      {mockReviews.length > 3 && (
        <div className={reviewStyles.bottomToggleWrapper}>
          <button
            onClick={toggleExpand}
            className={reviewStyles.controlBtn}
          >
            {isExpanded ? 'Show Less' : `Show ${mockReviews.length - 3} More`}
          </button>
        </div>
      )}

      {/* Anchor target for write review (placeholder) */}
      <div id="write-review" className={reviewStyles.srOnly} aria-hidden="true" />
    </section>
  );
};

export default ReviewsSection;
