// =============================================================
// Reviews.tsx — Compact 3-column reviews module
// Brand: Shila Murti (warm paper / bronze / deep red palette)
//
// Exports (default): Reviews
// Also exports: PhotoStars, StarPicker, SEED_REVIEWS, Review (type)
// =============================================================
'use client';

import React, { useState, useRef, useEffect } from 'react';
import './reviews.css';

export type Review = {
  id: number | string;
  name: string;
  initials: string;
  location: string;
  date: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  photos: string[];
  helpful?: number;
  verified?: boolean;
  material?: string;
};

// ---------- Seed data (used as default if no `reviews` prop) ----------
// Photos use picsum.photos so the demo renders without copying assets.
// Swap to real customer-uploaded URLs via the `reviews` prop.
export const SEED_REVIEWS: Review[] = [
  {
    id: 1,
    name: 'Ananya R.',
    initials: 'AR',
    location: 'Bengaluru, IN',
    date: '2 weeks ago',
    rating: 5,
    title: 'An heirloom from the moment it arrived',
    body:
      'The carving has a stillness you only see in temple work. I placed it in our prayer alcove and the morning light catches the brow exactly as the photos suggested. The crating was museum-grade — every edge protected, hand-signed certificate inside.',
    photos: [
      'https://picsum.photos/seed/shila-rv-1a/600/600',
      'https://picsum.photos/seed/shila-rv-1b/600/600',
    ],
    helpful: 24,
    verified: true,
    material: 'Black Granite',
  },
  {
    id: 2,
    name: 'Karthik V.',
    initials: 'KV',
    location: 'Hyderabad, IN',
    date: '1 month ago',
    rating: 5,
    title: 'Worth the wait — and the weight',
    body:
      "Took six weeks but the moment I unboxed it I understood. The stone is genuinely cold to the touch and rings softly when tapped. Sri Venkateshwarlu's hand is unmistakable on the lotus base.",
    photos: ['https://picsum.photos/seed/shila-rv-2a/600/600'],
    helpful: 17,
    verified: true,
    material: 'Black Granite',
  },
  {
    id: 3,
    name: 'Meera S.',
    initials: 'MS',
    location: 'Pune, IN',
    date: '2 months ago',
    rating: 4,
    title: 'Beautiful piece, packaging could be slimmer',
    body:
      "The idol itself is exceptional. The crate was massive — took two of us to move it. Once unpacked, breathtaking. The mukha lines are softer than the listing photos but that's our preference for a study niche.",
    photos: [],
    helpful: 9,
    verified: true,
    material: 'Black Granite',
  },
];

// ---------- Star primitives ----------
export function PhotoStars({ n = 5 }: { n?: number }) {
  return (
    <span className="rv-stars" aria-label={`${n} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={i < n ? 'var(--shila-bronze)' : 'rgba(20,20,20,0.12)'}
        >
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18l-6.2 4 1.7-7.4L2 10l7.1-1.1L12 2z" />
        </svg>
      ))}
    </span>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="rv-star-picker" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`rv-star-btn ${active ? 'is-on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill={active ? 'var(--shila-bronze)' : 'none'}
              stroke="var(--shila-bronze)"
              strokeWidth="1.5"
            >
              <path d="M12 2l2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18l-6.2 4 1.7-7.4L2 10l7.1-1.1L12 2z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Main component ----------
type ReviewsProps = {
  reviews?: Review[];
  onSubmit?: (review: Review) => Promise<void> | void;
  seeAllHref?: string;
};

type Draft = {
  rating: number;
  body: string;
  photos: string[];
  name: string;
};

export default function Reviews({ reviews: reviewsProp, onSubmit, seeAllHref = '#' }: ReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>(reviewsProp || SEED_REVIEWS);
  const [showDrawer, setShowDrawer] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    rating: 0,
    body: '',
    photos: [],
    name: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep local state in sync if parent updates the prop
  useEffect(() => {
    if (reviewsProp) setReviews(reviewsProp);
  }, [reviewsProp]);

  const total = reviews.length;
  const avg = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: reviews.filter((r) => r.rating === n).length,
    pct: total ? (reviews.filter((r) => r.rating === n).length / total) * 100 : 0,
  }));
  const allPhotos = reviews.flatMap((r) => r.photos.map((p) => ({ p, r })));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    const urls = files.map((f) => URL.createObjectURL(f));
    setDraft((d) => ({
      ...d,
      photos: [...d.photos, ...urls].slice(0, 3),
    }));
  };
  const removePhoto = (i: number) =>
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }));

  const submit = async () => {
    if (!draft.rating || !draft.body.trim() || !draft.name.trim()) return;
    const initials = draft.name
      .split(/\s+/)
      .map((s) => s[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const newReview: Review = {
      id: Date.now(),
      name: draft.name,
      initials,
      location: 'Just now',
      date: 'Moments ago',
      rating: draft.rating as 1 | 2 | 3 | 4 | 5,
      title: '',
      body: draft.body,
      photos: draft.photos,
      helpful: 0,
      verified: false,
      material: 'Black Granite',
    };
    setReviews((r) => [newReview, ...r]);
    setDraft({ rating: 0, body: '', photos: [], name: '' });
    setShowDrawer(false);
    if (onSubmit) {
      try {
        await onSubmit(newReview);
      } catch (err) {
        console.error('Reviews onSubmit failed:', err);
      }
    }
  };

  return (
    <section className="reviews-section" id="reviews">
      <div className="rv-head-row">
        <div>
          <div className="rv-eyebrow">
            <span className="glyph" /> Reviews
          </div>
          <h2 className="rv-title">From those who keep one</h2>
        </div>
        <button className="rv-write-btn" onClick={() => setShowDrawer(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Write a review
        </button>
      </div>

      {reviews.length === 0 ? (
        <div className="rv-empty">
          <div className="rv-empty-stars" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, j) => (
              <svg
                key={j}
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              >
                <path d="M12 2l2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18l-6.2 4 1.7-7.4L2 10l7.1-1.1L12 2z" />
              </svg>
            ))}
          </div>
          <h3 className="rv-empty-title">Still no reviews — yet</h3>
          <p className="rv-empty-lede">
            Be the first to share what stayed with you — the carving, the
            unboxing, the room it now lives in.
          </p>
          <button
            type="button"
            className="rv-empty-cta"
            onClick={() => setShowDrawer(true)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Write the first review
          </button>
        </div>
      ) : (
      <div className="rv-grid">
        {/* Summary */}
        <aside className="rv-summary">
          <div className="rv-avg">
            <span className="rv-avg-num">{avg.toFixed(1)}</span>
            <span className="rv-avg-of">/5</span>
          </div>
          <PhotoStars n={Math.round(avg)} />
          <div className="rv-count">
            Based on <strong>{total}</strong> verified reviews
          </div>
          <div className="rv-bars">
            {dist.map((d) => (
              <div key={d.n} className="rv-bar-row">
                <span className="rv-bar-n">{d.n}</span>
                <span className="rv-bar-track">
                  <span className="rv-bar-fill" style={{ width: `${d.pct}%` }} />
                </span>
                <span className="rv-bar-count">{d.count}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Quote list — each row is a self-contained card that already
            reads as "finished" when collapsed (avatar, title, body
            snippet, structured meta), and reveals the full body, larger
            photos, and helpful count on hover/focus. */}
        <div className="rv-quotes">
          {reviews.map((r) => (
            <div key={r.id} className="rv-quote-row" tabIndex={0}>
              <div className="rv-quote-head">
                <span className="rv-quote-avatar" aria-hidden="true">
                  {r.initials}
                </span>
                <div className="rv-quote-headlines">
                  <div className="rv-quote-titleline">
                    <span className="rv-quote-stars">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <svg
                          key={j}
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill={j < r.rating ? 'var(--shila-bronze)' : 'rgba(20,20,20,0.12)'}
                        >
                          <path d="M12 2l2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18l-6.2 4 1.7-7.4L2 10l7.1-1.1L12 2z" />
                        </svg>
                      ))}
                    </span>
                    <em className="rv-quote-title">{r.title || r.body.slice(0, 60)}</em>
                  </div>
                  <p className="rv-quote-snippet">{r.body}</p>
                  <div className="rv-quote-meta-inline">
                    <strong>{r.name}</strong>
                    <span className="rv-meta-dot" aria-hidden="true">·</span>
                    <span>{r.location}</span>
                    <span className="rv-meta-dot" aria-hidden="true">·</span>
                    <span>{r.date}</span>
                    {r.verified && (
                      <>
                        <span className="rv-meta-dot" aria-hidden="true">·</span>
                        <span className="rv-meta-vbadge">✓ Verified</span>
                      </>
                    )}
                    {r.photos.length > 0 && (
                      <>
                        <span className="rv-meta-dot" aria-hidden="true">·</span>
                        <span className="rv-meta-photos">
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          {r.photos.length}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="rv-quote-chevron" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
              <div className="rv-quote-expand">
                <div className="rv-quote-expand-inner">
                  <p className="rv-quote-body">{r.body}</p>
                  {r.photos.length > 0 && (
                    <div className="rv-quote-photos">
                      {r.photos.map((p, i) => (
                        <div
                          key={i}
                          className="rv-quote-photo"
                          style={{ backgroundImage: `url(${p})` }}
                        />
                      ))}
                    </div>
                  )}
                  {typeof r.helpful === 'number' && r.helpful > 0 && (
                    <div className="rv-quote-helpful">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                      </svg>
                      {r.helpful} found this helpful
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Photos column */}
        <aside className="rv-photos">
          <div className="rv-photos-label">Customer photos · {allPhotos.length}</div>
          <div className="rv-photos-grid">
            {allPhotos.slice(0, 6).map((ph, i) => (
              <div key={i} className="rv-photo" style={{ backgroundImage: `url(${ph.p})` }} />
            ))}
            {allPhotos.length > 6 && <div className="rv-photo-more">+{allPhotos.length - 6}</div>}
          </div>
          <a href={seeAllHref} className="rv-see-all">
            See all {total} reviews →
          </a>
        </aside>
      </div>
      )}

      {showDrawer && (
        <>
          <div className="rv-drawer-backdrop" onClick={() => setShowDrawer(false)} />
          <div className="rv-drawer" role="dialog" aria-label="Write a review">
            <div className="rv-drawer-head">
              <div>
                <div className="rv-drawer-eyebrow">
                  <span className="glyph" /> Write a review
                </div>
                <h3 className="rv-drawer-title">Tell others what you noticed</h3>
              </div>
              <button className="rv-drawer-close" onClick={() => setShowDrawer(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="rv-drawer-body">
              <div className="rv-drawer-row rv-drawer-rating-row">
                <span className="rv-drawer-label">Your rating</span>
                <StarPicker value={draft.rating} onChange={(n) => setDraft((d) => ({ ...d, rating: n }))} />
              </div>
              <div className="rv-drawer-grid">
                <div className="rv-drawer-row">
                  <span className="rv-drawer-label">Name</span>
                  <input
                    className="rv-input"
                    type="text"
                    placeholder="As you'd like to be displayed"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="rv-drawer-row">
                  <span className="rv-drawer-label">Photos · up to 3</span>
                  <div className="rv-photo-upload">
                    {draft.photos.map((p, i) => (
                      <div key={i} className="rv-upload-chip" style={{ backgroundImage: `url(${p})` }}>
                        <button type="button" className="rv-upload-x" onClick={() => removePhoto(i)}>
                          ×
                        </button>
                      </div>
                    ))}
                    {draft.photos.length < 3 && (
                      <button
                        type="button"
                        className="rv-upload-add"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleFiles}
                    />
                  </div>
                </div>
              </div>
              <div className="rv-drawer-row">
                <span className="rv-drawer-label">Your review</span>
                <textarea
                  className="rv-textarea"
                  rows={4}
                  placeholder="The carving, the stone, the unboxing — what stayed with you?"
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </div>
            </div>
            <div className="rv-drawer-foot">
              <span className="rv-form-note">Marked unverified until purchase is matched.</span>
              <div className="rv-drawer-actions">
                <button className="rv-cancel" onClick={() => setShowDrawer(false)}>
                  Cancel
                </button>
                <button
                  className="rv-submit"
                  onClick={submit}
                  disabled={!draft.rating || !draft.body.trim() || !draft.name.trim()}
                >
                  Post review
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
