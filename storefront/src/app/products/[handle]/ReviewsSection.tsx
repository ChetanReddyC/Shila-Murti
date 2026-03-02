'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ProductDetailPage.module.css';
import reviewStyles from './ReviewsSection.module.css';
import { useSession } from 'next-auth/react';
import LoginModal from './LoginModal';
import {
  fetchReviews,
  submitReview,
  updateReview,
  ReviewAuthError,
  type Review,
} from '../../../services/reviewsService';

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

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

/**
 * Interactive star picker for the write-review form.
 */
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className={reviewStyles.starPicker} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`${reviewStyles.starPickerBtn} ${star <= (hover || value) ? reviewStyles.starPickerActive : ''
            }`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Star filled={star <= (hover || value)} />
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────
const REVIEWS_PER_PAGE = 10;

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────

interface ReviewsSectionProps {
  productId: string;
}

const ReviewsSection: React.FC<ReviewsSectionProps> = ({ productId }) => {
  // ── Auth state ──
  const { data: session, status: sessionStatus } = useSession();
  const customerId = (session as any)?.customerId as string | undefined;

  // ── Review list state ──
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Pagination state ──
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Grid ref + locked height (fits ~5 reviews, scrollable internally) ──
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number | undefined>(undefined);

  // ── Write-review form state ──
  const [showForm, setShowForm] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── Login modal state ──
  const [showLoginModal, setShowLoginModal] = useState(false);

  // ── Edit state ──
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  // ── Fetch reviews on mount ──
  useEffect(() => {
    if (!productId) return;

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    fetchReviews(productId, 1, REVIEWS_PER_PAGE)
      .then((data) => {
        if (!cancelled) {
          setReviews(data.reviews);
          setTotalCount(data.count);
          setTotalPages(data.totalPages);
          setPage(data.page);
          setHasMore(data.page < data.totalPages);
        }
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err.message || 'Failed to load reviews');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // ── Lock grid height on mobile only (flex-column) so it fits ~3 cards ──
  useEffect(() => {
    if (!loading && reviews.length > 0 && !gridHeight && gridRef.current) {
      // Only lock height on mobile (< 768px matches the CSS breakpoint)
      if (window.innerWidth >= 768) return;

      requestAnimationFrame(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const children = Array.from(grid.children) as HTMLElement[];
        const limit = Math.min(children.length, 3);
        if (limit === 0) return;

        const style = getComputedStyle(grid);
        const gap = parseFloat(style.gap) || parseFloat(style.rowGap) || 0;

        let height = 0;
        for (let i = 0; i < limit; i++) {
          height += children[i].offsetHeight;
          if (i < limit - 1) height += gap;
        }
        height += parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        setGridHeight(height);
      });
    }
  }, [loading, reviews.length, gridHeight]);

  // ── Load more handler ──
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    const prevCount = reviews.length;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchReviews(productId, nextPage, REVIEWS_PER_PAGE);
      setReviews((prev) => [...prev, ...data.reviews]);
      setPage(data.page);
      setTotalCount(data.count);
      setTotalPages(data.totalPages);
      setHasMore(data.page < data.totalPages);

      // Smooth scroll to the first newly loaded review
      requestAnimationFrame(() => {
        const grid = gridRef.current;
        if (grid) {
          const firstNewItem = grid.children[prevCount] as HTMLElement;
          if (firstNewItem) {
            if (gridHeight) {
              // Mobile: scroll inside the locked-height grid
              grid.scrollTo({
                top: firstNewItem.offsetTop - parseFloat(getComputedStyle(grid).paddingTop),
                behavior: 'smooth',
              });
            } else {
              // Desktop: scroll the page to the new review
              firstNewItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      });
    } catch (err: any) {
      console.error('[ReviewsSection] Load more failed:', err?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [productId, page, loadingMore, hasMore, reviews.length]);

  // ── Computed values ──
  const average =
    reviews.length > 0
      ? Math.round(
        (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) * 10
      ) / 10
      : 0;

  // ── "Write a Review" click handler (auth-gated) ──
  const handleWriteReviewClick = useCallback(() => {
    if (sessionStatus === 'authenticated' && customerId) {
      setShowForm(true);
      setSubmitError(null);
      setSubmitSuccess(false);
      setEditingReviewId(null);
    } else {
      setShowLoginModal(true);
    }
  }, [sessionStatus, customerId]);

  // ── Login modal success → open form ──
  const handleLoginSuccess = useCallback(() => {
    setShowLoginModal(false);
    setShowForm(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setEditingReviewId(null);
  }, []);

  // ── Close form ──
  const closeForm = useCallback(() => {
    setShowForm(false);
    setAuthorName('');
    setRating(0);
    setContent('');
    setSubmitError(null);
    setEditingReviewId(null);
  }, []);

  // ── Start editing a review ──
  const startEditing = useCallback((review: Review) => {
    setEditingReviewId(review.id);
    setAuthorName(review.author_name);
    setRating(review.rating);
    setContent(review.content);
    setShowForm(true);
    setSubmitError(null);
    setSubmitSuccess(false);
  }, []);

  // ── Submit / Update handler ──
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!authorName.trim()) {
        setSubmitError('Please enter your name');
        return;
      }
      if (rating === 0) {
        setSubmitError('Please select a star rating');
        return;
      }
      if (!content.trim()) {
        setSubmitError('Please write a review');
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        if (editingReviewId) {
          // ── Update existing review ──
          const updatedReview = await updateReview({
            review_id: editingReviewId,
            author_name: authorName.trim(),
            rating,
            content: content.trim(),
          });

          setReviews((prev) =>
            prev.map((r) => (r.id === editingReviewId ? { ...r, ...updatedReview } : r))
          );
        } else {
          // ── Create new review ──
          const newReview = await submitReview({
            product_id: productId,
            author_name: authorName.trim(),
            rating,
            content: content.trim(),
          });

          setReviews((prev) => [newReview, ...prev]);
          setTotalCount((prev) => prev + 1);
        }

        setSubmitSuccess(true);

        setTimeout(() => {
          closeForm();
          setSubmitSuccess(false);
        }, 2000);
      } catch (err: any) {
        if (err instanceof ReviewAuthError) {
          setShowLoginModal(true);
        } else {
          setSubmitError(err.message || 'Failed to submit review');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [productId, authorName, rating, content, editingReviewId, closeForm]
  );

  // ── Loading state ──
  if (loading) {
    return (
      <section className={reviewStyles.reviewsSection} aria-labelledby="reviews-title">
        <div className={reviewStyles.headerContainer}>
          <h3 id="reviews-title" className={reviewStyles.title}>What Customers Say</h3>
          <div className={reviewStyles.subtitleWrapper}>
            <p className={reviewStyles.subtitle}>Loading reviews…</p>
          </div>
        </div>
        <div className={reviewStyles.loadingSkeleton}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={reviewStyles.skeletonCard} />
          ))}
        </div>
      </section>
    );
  }

  // ── Fetch error state ──
  if (fetchError) {
    return (
      <section className={reviewStyles.reviewsSection} aria-labelledby="reviews-title">
        <div className={reviewStyles.headerContainer}>
          <h3 id="reviews-title" className={reviewStyles.title}>What Customers Say</h3>
        </div>
        <div className={reviewStyles.emptyStateContainer}>
          <p className={reviewStyles.emptyStateText}>{fetchError}</p>
        </div>
      </section>
    );
  }

  // ── Main render ──
  return (
    <section className={reviewStyles.reviewsSection} aria-labelledby="reviews-title">
      {/* Header */}
      <div className={reviewStyles.headerContainer}>
        <h3 id="reviews-title" className={reviewStyles.title}>
          What Customers Say
        </h3>
        <div className={reviewStyles.subtitleWrapper}>
          <p className={reviewStyles.subtitle}>
            Real experiences from people who bought this product.
          </p>
        </div>
        {reviews.length > 0 && (
          <div className={reviewStyles.summaryRow}>
            <span className={reviewStyles.summaryRating}>{average.toFixed(1)} / 5</span>
            <div className={reviewStyles.starsContainer} aria-label={`${average} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} filled={i <= Math.round(average)} />
              ))}
            </div>
            <span className={reviewStyles.reviewCount}>
              {totalCount} {totalCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>
        )}
      </div>

      {/* ── Login Modal ── */}
      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* ── Write / Edit Review Form (slide-down) ── */}
      {showForm && (
        <div className={reviewStyles.writeReviewForm}>
          {submitSuccess ? (
            <div className={reviewStyles.successMessage}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={reviewStyles.successIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{editingReviewId ? 'Review updated!' : 'Thank you for your review!'}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={reviewStyles.formInner}>
              <h4 className={reviewStyles.formTitle}>
                {editingReviewId ? 'Edit Your Review' : 'Write a Review'}
              </h4>

              {/* Author name */}
              <div className={reviewStyles.formField}>
                <label htmlFor="review-author" className={reviewStyles.formLabel}>
                  Display Name
                </label>
                <input
                  id="review-author"
                  type="text"
                  className={reviewStyles.formInput}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Enter your display name"
                  maxLength={100}
                  disabled={submitting}
                />
              </div>

              {/* Star rating */}
              <div className={reviewStyles.formField}>
                <label className={reviewStyles.formLabel}>Rating</label>
                <StarPicker value={rating} onChange={setRating} />
              </div>

              {/* Content */}
              <div className={reviewStyles.formField}>
                <label htmlFor="review-content" className={reviewStyles.formLabel}>
                  Your Review
                </label>
                <textarea
                  id="review-content"
                  className={reviewStyles.formTextarea}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts about this product…"
                  maxLength={2000}
                  rows={4}
                  disabled={submitting}
                />
                <span className={reviewStyles.charCount}>{content.length}/2000</span>
              </div>

              {/* Error message */}
              {submitError && (
                <div className={reviewStyles.formError} role="alert">
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className={reviewStyles.formActions}>
                <button
                  type="button"
                  className={reviewStyles.cancelBtn}
                  onClick={closeForm}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={reviewStyles.submitBtn}
                  disabled={submitting}
                >
                  {submitting
                    ? (editingReviewId ? 'Updating…' : 'Submitting…')
                    : (editingReviewId ? 'Update Review' : 'Submit Review')
                  }
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Reviews list or empty state ── */}
      {reviews.length === 0 ? (
        <div className={reviewStyles.emptyStateContainer}>
          <div className={reviewStyles.emptyStateIconWrapper}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className={reviewStyles.emptyStateIconSvg}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
              />
            </svg>
          </div>
          <h4 className={reviewStyles.emptyStateTitle}>No reviews yet</h4>
          <p className={reviewStyles.emptyStateText}>
            This piece is waiting for its first admirer. Be the first to share your thoughts on this art.
          </p>
          {!showForm && (
            <button className={reviewStyles.writeReviewBtn} onClick={handleWriteReviewClick}>
              Write a Review
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Write review button when reviews exist */}
          {!showForm && (
            <div className={reviewStyles.writeReviewBtnWrapper}>
              <button className={reviewStyles.writeReviewBtn} onClick={handleWriteReviewClick}>
                Write a Review
              </button>
            </div>
          )}

          <div
            ref={gridRef}
            className={`${reviewStyles.reviewsGrid} ${gridHeight ? reviewStyles.reviewsGridExpanded : ''}`}
            style={gridHeight ? { height: gridHeight } : undefined}
          >
            {reviews.map((r) => (
              <article key={r.id} className={reviewStyles.reviewCard}>
                <header className={reviewStyles.cardHeader}>
                  <div className={reviewStyles.authorMeta}>
                    <div className={reviewStyles.authorNameRow}>
                      <h4 className={reviewStyles.authorName}>{r.author_name}</h4>
                      {r.account_name && (
                        <span className={reviewStyles.accountName}>
                          {r.account_name}
                        </span>
                      )}
                    </div>
                    <div className={reviewStyles.subMeta}>
                      <div className={reviewStyles.starsContainer} aria-label={`Rating: ${r.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} filled={i <= r.rating} />
                        ))}
                      </div>
                      <span className={reviewStyles.dateString}>
                        • {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Edit button — only visible on own reviews */}
                  {customerId && r.customer_id === customerId && (
                    <button
                      className={reviewStyles.editBtn}
                      onClick={() => startEditing(r)}
                      aria-label="Edit your review"
                      title="Edit your review"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  )}
                </header>
                <p className={reviewStyles.reviewContent}>{r.content}</p>
              </article>
            ))}
          </div>

          {/* Load More button */}
          {hasMore && (
            <div className={reviewStyles.bottomToggleWrapper}>
              <button
                onClick={loadMore}
                className={reviewStyles.controlBtn}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : `Load More (${totalCount - reviews.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      <div id="write-review" className={reviewStyles.srOnly} aria-hidden="true" />
    </section>
  );
};

export default ReviewsSection;
