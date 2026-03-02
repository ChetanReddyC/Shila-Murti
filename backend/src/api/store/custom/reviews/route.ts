import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import sanitizeHtml from "sanitize-html"
import ReviewModuleService from "../../../../modules/review/service"
import { REVIEW_MODULE } from "../../../../modules/review"

// ────────────────────────────────────────────────────────────────
// In-memory rate limiter — keyed by customer_id, allows 5 POSTs
// per 10 minutes. Resets on server restart which is acceptable
// for this use-case; no Redis dependency needed.
// ────────────────────────────────────────────────────────────────
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(customerId: string): boolean {
    const now = Date.now()
    const bucket = rateBuckets.get(customerId)

    if (!bucket || now > bucket.resetAt) {
        rateBuckets.set(customerId, { count: 1, resetAt: now + RATE_WINDOW_MS })
        return false
    }

    bucket.count += 1
    return bucket.count > RATE_LIMIT
}

// ────────────────────────────────────────────────────────────────
// Sanitisation helpers — strip HTML tags and enforce length limits.
// ────────────────────────────────────────────────────────────────
function stripHtml(input: string): string {
    return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })
}

function sanitiseString(raw: unknown, maxLength: number): string | null {
    if (typeof raw !== "string") return null
    const cleaned = stripHtml(raw).trim()
    if (cleaned.length === 0) return null
    return cleaned.substring(0, maxLength)
}

// ────────────────────────────────────────────────────────────────
// GET /store/custom/reviews?product_id=prod_xxx&page=1&limit=10
// Public — no auth needed.
// Returns paginated reviews for the given product, newest first,
// enriched with the customer's full account name.
// ────────────────────────────────────────────────────────────────
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const productId = req.query.product_id as string | undefined

    if (!productId) {
        res.status(400).json({ message: "Missing required query param: product_id" })
        return
    }

    // Parse pagination params with sane defaults
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10))
    const skip = (page - 1) * limit

    try {
        const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

        const [reviews, count] = await reviewService.listAndCountProductReviews(
            { product_id: productId },
            { order: { created_at: "DESC" }, skip, take: limit }
        )

        // Enrich reviews with customer full name from Medusa customer records
        let enrichedReviews = reviews
        try {
            const customerIds = [...new Set(reviews.map((r: any) => r.customer_id).filter(Boolean))]
            if (customerIds.length > 0) {
                const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
                const customers = await customerModuleService.listCustomers(
                    { id: customerIds },
                    { take: customerIds.length }
                )
                const customerMap = new Map<string, string>()
                for (const c of customers) {
                    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
                    if (fullName) customerMap.set(c.id, fullName)
                }
                enrichedReviews = reviews.map((r: any) => ({
                    ...r,
                    account_name: customerMap.get(r.customer_id) || null,
                }))
            }
        } catch (err: any) {
            console.warn("[Reviews][GET] Could not enrich with customer names:", err?.message)
        }

        const totalPages = Math.ceil(count / limit)

        res.json({ reviews: enrichedReviews, count, page, limit, totalPages })
    } catch (error: any) {
        console.error("[Reviews][GET] Error fetching reviews:", error?.message)
        res.status(500).json({ message: "Failed to fetch reviews" })
    }
}

// ────────────────────────────────────────────────────────────────
// POST /store/custom/reviews
// Auth-required — authGuard middleware must run before this handler.
// Body: { product_id, author_name, rating, content }
// customer_id is extracted from the JWT claims set by authGuard.
// ────────────────────────────────────────────────────────────────
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    // customer_id is attached by authGuard middleware
    const customerId = (req as any).customer_id as string | undefined

    if (!customerId) {
        res.status(401).json({ message: "Authentication required to submit a review" })
        return
    }

    // Rate-limit per customer to prevent spam
    if (isRateLimited(customerId)) {
        res.status(429).json({ message: "Too many reviews submitted. Please try again later." })
        return
    }

    // ── Validate & sanitise inputs ──
    const { product_id, author_name, rating, content } = req.body as Record<string, unknown>

    const sanitisedProductId = sanitiseString(product_id, 200)
    const sanitisedAuthorName = sanitiseString(author_name, 100)
    const sanitisedContent = sanitiseString(content, 2000)
    const parsedRating = typeof rating === "number" ? Math.round(rating) : parseInt(String(rating), 10)

    if (!sanitisedProductId) {
        res.status(400).json({ message: "product_id is required" })
        return
    }
    if (!sanitisedAuthorName) {
        res.status(400).json({ message: "author_name is required (max 100 characters)" })
        return
    }
    if (!sanitisedContent) {
        res.status(400).json({ message: "content is required (max 2000 characters)" })
        return
    }
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        res.status(400).json({ message: "rating must be an integer between 1 and 5" })
        return
    }

    try {
        const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

        // Enforce one review per customer per product (application-level fast path)
        const existing = await reviewService.listProductReviews({
            product_id: sanitisedProductId,
            customer_id: customerId,
        })

        if (existing.length > 0) {
            res.status(409).json({ message: "You have already reviewed this product" })
            return
        }

        let created
        try {
            created = await reviewService.createProductReviews({
                product_id: sanitisedProductId,
                customer_id: customerId,
                author_name: sanitisedAuthorName,
                rating: parsedRating,
                content: sanitisedContent,
            })
        } catch (insertError: any) {
            // Catch unique constraint violation (PostgreSQL error code 23505)
            // Handles the race condition where two concurrent requests
            // both pass the SELECT check above
            if (insertError?.code === "23505" || insertError?.detail?.includes("already exists")) {
                res.status(409).json({ message: "You have already reviewed this product" })
                return
            }
            throw insertError
        }

        res.status(201).json({ review: created })
    } catch (error: any) {
        console.error("[Reviews][POST] Error creating review:", error?.message)
        res.status(500).json({ message: "Failed to create review" })
    }
}

// ────────────────────────────────────────────────────────────────
// PUT /store/custom/reviews
// Auth-required — updates an existing review.
// Body: { review_id, author_name?, rating?, content? }
// Only the original author (customer_id match) may edit.
// ────────────────────────────────────────────────────────────────
export async function PUT(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const customerId = (req as any).customer_id as string | undefined

    if (!customerId) {
        res.status(401).json({ message: "Authentication required to edit a review" })
        return
    }

    const { review_id, author_name, rating, content } = req.body as Record<string, unknown>

    if (!review_id || typeof review_id !== "string") {
        res.status(400).json({ message: "review_id is required" })
        return
    }

    try {
        const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

        // Fetch the existing review
        const existing = await reviewService.listProductReviews({ id: review_id })
        if (existing.length === 0) {
            res.status(404).json({ message: "Review not found" })
            return
        }

        const review = existing[0]

        // Ownership check
        if (review.customer_id !== customerId) {
            res.status(403).json({ message: "You can only edit your own reviews" })
            return
        }

        // Build update payload — only include fields that were provided
        const updatePayload: Record<string, unknown> = {}

        if (author_name !== undefined) {
            const sanitised = sanitiseString(author_name, 100)
            if (!sanitised) {
                res.status(400).json({ message: "author_name cannot be empty (max 100 characters)" })
                return
            }
            updatePayload.author_name = sanitised
        }

        if (rating !== undefined) {
            const parsed = typeof rating === "number" ? Math.round(rating) : parseInt(String(rating), 10)
            if (isNaN(parsed) || parsed < 1 || parsed > 5) {
                res.status(400).json({ message: "rating must be an integer between 1 and 5" })
                return
            }
            updatePayload.rating = parsed
        }

        if (content !== undefined) {
            const sanitised = sanitiseString(content, 2000)
            if (!sanitised) {
                res.status(400).json({ message: "content cannot be empty (max 2000 characters)" })
                return
            }
            updatePayload.content = sanitised
        }

        if (Object.keys(updatePayload).length === 0) {
            res.status(400).json({ message: "No fields to update" })
            return
        }

        const updated = await reviewService.updateProductReviews({ id: review_id, ...updatePayload })

        res.json({ review: updated })
    } catch (error: any) {
        console.error("[Reviews][PUT] Error updating review:", error?.message)
        res.status(500).json({ message: "Failed to update review" })
    }
}
