/**
 * Reviews Service — Client-Side
 *
 * Talks to the Next.js API proxy (/api/reviews) which handles
 * auth token signing and forwards requests to the Medusa backend.
 *
 * GET is public (no auth required).
 * POST requires the user to be signed in (NextAuth session).
 * PUT requires the user to be signed in (edit own review).
 */

// ── Types ──

export interface Review {
    id: string
    product_id: string
    customer_id: string
    author_name: string
    rating: number
    content: string
    created_at: string
    account_name?: string | null
}

export interface UpdateReviewPayload {
    review_id: string
    author_name?: string
    rating?: number
    content?: string
}

export interface SubmitReviewPayload {
    product_id: string
    author_name: string
    rating: number
    content: string
}

export interface ReviewsResponse {
    reviews: Review[]
    count: number
    page: number
    limit: number
    totalPages: number
}

export interface ReviewResponse {
    review: Review
}

export interface ReviewError {
    ok: false
    error: string
    message?: string
}

// ── API Functions ──

/**
 * Fetch paginated reviews for a product (public, no auth needed).
 */
export async function fetchReviews(
    productId: string,
    page: number = 1,
    limit: number = 10
): Promise<ReviewsResponse> {
    const res = await fetch(
        `/api/reviews?product_id=${encodeURIComponent(productId)}&page=${page}&limit=${limit}`,
        {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'include',
        }
    )

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Failed to fetch reviews' }))
        throw new Error(errData.message || `Failed to fetch reviews (${res.status})`)
    }

    const data: ReviewsResponse = await res.json()
    return data
}

/**
 * Submit a review (requires authentication).
 * Returns the newly created review, or throws on error.
 */
export async function submitReview(payload: SubmitReviewPayload): Promise<Review> {
    const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Failed to submit review' }))

        // Special handling for auth errors
        if (res.status === 401) {
            throw new ReviewAuthError(errData.message || 'Please sign in to submit a review')
        }

        // Duplicate review
        if (res.status === 409) {
            throw new Error(errData.message || 'You have already reviewed this product')
        }

        throw new Error(errData.message || `Failed to submit review (${res.status})`)
    }

    const data: ReviewResponse = await res.json()
    return data.review
}

/**
 * Update an existing review (requires authentication + ownership).
 */
export async function updateReview(payload: UpdateReviewPayload): Promise<Review> {
    const res = await fetch('/api/reviews', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Failed to update review' }))

        if (res.status === 401) {
            throw new ReviewAuthError(errData.message || 'Please sign in to edit a review')
        }
        if (res.status === 403) {
            throw new Error(errData.message || 'You can only edit your own reviews')
        }

        throw new Error(errData.message || `Failed to update review (${res.status})`)
    }

    const data: ReviewResponse = await res.json()
    return data.review
}

/**
 * Custom error class for auth-related failures.
 * The UI can check `instanceof ReviewAuthError` to show a sign-in prompt.
 */
export class ReviewAuthError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ReviewAuthError'
    }
}
