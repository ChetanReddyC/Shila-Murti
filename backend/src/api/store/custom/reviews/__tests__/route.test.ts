/**
 * Unit tests for the Reviews API route handlers (GET, POST, PUT).
 *
 * Covers validation, authentication, rate limiting, HTML sanitisation,
 * and a critical regression test verifying updateProductReviews receives
 * a single { id, ...fields } object (not separate arguments).
 *
 * Run with:
 *   npx jest src/api/store/custom/reviews/__tests__/route.test.ts
 */

// ── Module mocks (hoisted before all imports) ────────────────────

jest.mock("@medusajs/framework/http", () => ({}))
jest.mock("@medusajs/framework/utils", () => ({
    Modules: { CUSTOMER: "customerModule" },
}))
jest.mock("../../../../../modules/review/service", () => jest.fn())
jest.mock("../../../../../modules/review", () => ({
    REVIEW_MODULE: "reviewModule",
}))

import { GET, POST, PUT } from "../route"

// ── Helpers ──────────────────────────────────────────────────────

interface MockRes {
    _status: number
    _json: any
    status: jest.Mock
    json: jest.Mock
}

function createRes(): MockRes {
    const res: any = { _status: 200, _json: null }
    res.status = jest.fn((code: number) => { res._status = code; return res })
    res.json = jest.fn((data: any) => { res._json = data; return res })
    return res
}

function createReq(overrides: Record<string, any> = {}): any {
    return {
        query: {},
        body: {},
        scope: { resolve: jest.fn() },
        ...overrides,
    }
}

function mockReviewService(overrides: Record<string, any> = {}) {
    return {
        listProductReviews: jest.fn().mockResolvedValue([]),
        listAndCountProductReviews: jest.fn().mockResolvedValue([[], 0]),
        createProductReviews: jest.fn().mockResolvedValue({ id: "rev_new" }),
        updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_upd" }),
        ...overrides,
    }
}

function mockCustomerService(overrides: Record<string, any> = {}) {
    return {
        listCustomers: jest.fn().mockResolvedValue([]),
        ...overrides,
    }
}

function scopeResolving(services: Record<string, any>) {
    return {
        resolve: jest.fn((mod: string) => services[mod] ?? null),
    }
}

// Suppress console noise from error-handling paths
beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
    jest.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────
// GET /store/custom/reviews
// ─────────────────────────────────────────────────────────────────

describe("GET /store/custom/reviews", () => {
    it("returns 400 when product_id query param is missing", async () => {
        const req = createReq()
        const res = createRes()

        await GET(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns reviews and pagination metadata for a valid product_id", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: "cust_1", author_name: "Alice", rating: 5, content: "Wonderful!" },
        ]
        const reviewSvc = mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 1]) })
        const customerSvc = mockCustomerService({
            listCustomers: jest.fn().mockResolvedValue([
                { id: "cust_1", first_name: "Alice", last_name: "Smith" },
            ]),
        })
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({ reviewModule: reviewSvc, customerModule: customerSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.reviews).toHaveLength(1)
        expect(res._json.reviews[0].account_name).toBe("Alice Smith")
        expect(res._json.count).toBe(1)
        expect(res._json.page).toBe(1)
        expect(res._json.limit).toBe(10)
        expect(res._json.totalPages).toBe(1)
    })

    it("passes correct filter, ordering, skip, and take to listAndCountProductReviews", async () => {
        const reviewSvc = mockReviewService()
        const req = createReq({
            query: { product_id: "prod_99" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(reviewSvc.listAndCountProductReviews).toHaveBeenCalledWith(
            { product_id: "prod_99" },
            { order: { created_at: "DESC" }, skip: 0, take: 10 },
        )
    })

    it("uses page and limit query params to calculate skip/take", async () => {
        const reviewSvc = mockReviewService()
        const req = createReq({
            query: { product_id: "prod_1", page: "3", limit: "5" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        // page=3, limit=5 → skip=(3-1)*5=10, take=5
        expect(reviewSvc.listAndCountProductReviews).toHaveBeenCalledWith(
            { product_id: "prod_1" },
            { order: { created_at: "DESC" }, skip: 10, take: 5 },
        )
    })

    it("returns correct page metadata with page=2, limit=10, total=25", async () => {
        const reviews = Array.from({ length: 10 }, (_, i) => ({ id: `rev_${i}`, customer_id: null }))
        const reviewSvc = mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 25]) })
        const req = createReq({
            query: { product_id: "prod_1", page: "2", limit: "10" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._json.count).toBe(25)
        expect(res._json.page).toBe(2)
        expect(res._json.limit).toBe(10)
        expect(res._json.totalPages).toBe(3)
    })

    it("defaults page to 1 and limit to 10 when params are missing", async () => {
        const reviewSvc = mockReviewService()
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(reviewSvc.listAndCountProductReviews).toHaveBeenCalledWith(
            { product_id: "prod_1" },
            { order: { created_at: "DESC" }, skip: 0, take: 10 },
        )
        expect(res._json.page).toBe(1)
        expect(res._json.limit).toBe(10)
    })

    it("clamps limit to max 50", async () => {
        const reviewSvc = mockReviewService()
        const req = createReq({
            query: { product_id: "prod_1", limit: "999" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(reviewSvc.listAndCountProductReviews).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ take: 50 }),
        )
    })

    it("clamps page to minimum 1 when invalid value given", async () => {
        const reviewSvc = mockReviewService()
        const req = createReq({
            query: { product_id: "prod_1", page: "-5" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(reviewSvc.listAndCountProductReviews).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ skip: 0 }),
        )
    })

    it("enriches reviews with customer full names (first + last)", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: "cust_1", author_name: "A", rating: 5, content: "X" },
            { id: "rev_2", product_id: "prod_1", customer_id: "cust_2", author_name: "B", rating: 4, content: "Y" },
        ]
        const customerSvc = mockCustomerService({
            listCustomers: jest.fn().mockResolvedValue([
                { id: "cust_1", first_name: "John", last_name: "Doe" },
                { id: "cust_2", first_name: "Jane", last_name: null },
            ]),
        })
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({
                reviewModule: mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 2]) }),
                customerModule: customerSvc,
            }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._json.reviews[0].account_name).toBe("John Doe")
        expect(res._json.reviews[1].account_name).toBe("Jane")
    })

    it("sets account_name to null when customer has no name on file", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: "cust_noname", author_name: "A", rating: 5, content: "X" },
        ]
        const customerSvc = mockCustomerService({
            listCustomers: jest.fn().mockResolvedValue([
                { id: "cust_noname", first_name: null, last_name: null },
            ]),
        })
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({
                reviewModule: mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 1]) }),
                customerModule: customerSvc,
            }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._json.reviews[0].account_name).toBeNull()
    })

    it("skips enrichment for reviews without customer_id", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: null, author_name: "Anon", rating: 3, content: "Ok" },
        ]
        const reviewSvc = mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 1]) })
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.reviews).toHaveLength(1)
    })

    it("handles customer lookup failures gracefully — still returns reviews", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: "cust_1", author_name: "A", rating: 5, content: "X" },
        ]
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({
                reviewModule: mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 1]) }),
                customerModule: { listCustomers: jest.fn().mockRejectedValue(new Error("DB down")) },
            }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.reviews).toHaveLength(1)
        expect(res._json.reviews[0].account_name).toBeUndefined()
    })

    it("returns 500 when listAndCountProductReviews throws", async () => {
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({
                reviewModule: { listAndCountProductReviews: jest.fn().mockRejectedValue(new Error("DB error")) },
            }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })

    it("deduplicates customer IDs before lookup", async () => {
        const reviews = [
            { id: "rev_1", product_id: "prod_1", customer_id: "cust_dup", author_name: "A", rating: 5, content: "X" },
            { id: "rev_2", product_id: "prod_1", customer_id: "cust_dup", author_name: "B", rating: 4, content: "Y" },
        ]
        const customerSvc = mockCustomerService({
            listCustomers: jest.fn().mockResolvedValue([
                { id: "cust_dup", first_name: "Same", last_name: "Person" },
            ]),
        })
        const req = createReq({
            query: { product_id: "prod_1" },
            scope: scopeResolving({
                reviewModule: mockReviewService({ listAndCountProductReviews: jest.fn().mockResolvedValue([reviews, 2]) }),
                customerModule: customerSvc,
            }),
        })
        const res = createRes()

        await GET(req, res as any)

        const calledIds = customerSvc.listCustomers.mock.calls[0][0].id
        expect(calledIds).toEqual(["cust_dup"])
    })
})

// ─────────────────────────────────────────────────────────────────
// POST /store/custom/reviews
// ─────────────────────────────────────────────────────────────────

describe("POST /store/custom/reviews", () => {
    it("returns 401 when not authenticated (no customer_id)", async () => {
        const req = createReq({ body: { product_id: "prod_1" } })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res._json.message).toMatch(/authentication/i)
    })

    it("returns 400 when product_id is missing", async () => {
        const req = createReq({
            customer_id: "cust_p1",
            body: { author_name: "John", rating: 5, content: "Great!" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is only HTML tags (empty after strip)", async () => {
        const req = createReq({
            customer_id: "cust_p2",
            body: { product_id: "<b></b>", author_name: "John", rating: 5, content: "Good" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is not a string", async () => {
        const req = createReq({
            customer_id: "cust_p3",
            body: { product_id: 12345, author_name: "John", rating: 5, content: "Good" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when author_name is missing", async () => {
        const req = createReq({
            customer_id: "cust_p4",
            body: { product_id: "prod_1", rating: 5, content: "Great!" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/author_name/i)
    })

    it("returns 400 when content is missing", async () => {
        const req = createReq({
            customer_id: "cust_p5",
            body: { product_id: "prod_1", author_name: "John", rating: 5 },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/content/i)
    })

    it("returns 400 when rating is below 1", async () => {
        const req = createReq({
            customer_id: "cust_p6",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 0 },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("returns 400 when rating is above 5", async () => {
        const req = createReq({
            customer_id: "cust_p7",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 6 },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("returns 400 when rating is not a valid number", async () => {
        const req = createReq({
            customer_id: "cust_p8",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: "abc" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("returns 409 when customer already reviewed the product", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_existing" }]),
        })
        const req = createReq({
            customer_id: "cust_p9",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res._json.message).toMatch(/already reviewed/i)
    })

    it("creates a review with valid data and returns 201", async () => {
        const createdReview = {
            id: "rev_created",
            product_id: "prod_1",
            customer_id: "cust_p10",
            author_name: "John",
            rating: 4,
            content: "Nice product",
        }
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue(createdReview),
        })
        const req = createReq({
            customer_id: "cust_p10",
            body: { product_id: "prod_1", author_name: "John", content: "Nice product", rating: 4 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(res._json.review).toEqual(createdReview)
        expect(reviewSvc.createProductReviews).toHaveBeenCalledWith({
            product_id: "prod_1",
            customer_id: "cust_p10",
            author_name: "John",
            rating: 4,
            content: "Nice product",
        })
    })

    it("sanitises HTML tags from all string inputs", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_html" }),
        })
        const req = createReq({
            customer_id: "cust_p11",
            body: {
                product_id: "<img>prod_1",
                author_name: "<b>Evil</b> User",
                content: "<script>alert('xss')</script>Great product!",
                rating: 5,
            },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        const payload = reviewSvc.createProductReviews.mock.calls[0][0]
        expect(payload.product_id).toBe("prod_1")
        expect(payload.author_name).toBe("Evil User")
        // sanitize-html strips <script> tags AND their content (stricter than regex)
        expect(payload.content).toBe("Great product!")
        expect(payload.product_id).not.toContain("<")
        expect(payload.author_name).not.toContain("<")
        expect(payload.content).not.toContain("<")
    })

    it("rounds decimal ratings to the nearest integer", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_round" }),
        })
        const req = createReq({
            customer_id: "cust_p12",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 3.7 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(reviewSvc.createProductReviews.mock.calls[0][0].rating).toBe(4)
    })

    it("parses string ratings as integers", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_str" }),
        })
        const req = createReq({
            customer_id: "cust_p13",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: "4" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(reviewSvc.createProductReviews.mock.calls[0][0].rating).toBe(4)
    })

    it("truncates author_name to 100 characters", async () => {
        const longName = "A".repeat(150)
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_trunc" }),
        })
        const req = createReq({
            customer_id: "cust_p14",
            body: { product_id: "prod_1", author_name: longName, content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(reviewSvc.createProductReviews.mock.calls[0][0].author_name).toHaveLength(100)
    })

    it("truncates content to 2000 characters", async () => {
        const longContent = "B".repeat(2500)
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_trunc2" }),
        })
        const req = createReq({
            customer_id: "cust_p15",
            body: { product_id: "prod_1", author_name: "John", content: longContent, rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(reviewSvc.createProductReviews.mock.calls[0][0].content).toHaveLength(2000)
    })

    it("returns 429 when customer exceeds rate limit (>5 in window)", async () => {
        const rateLimitCustId = "cust_rate_limit_test_" + Date.now()

        // Make 5 calls that pass the rate limiter (they fail at validation — that's fine,
        // the rate counter was already incremented before validation runs).
        for (let i = 0; i < 5; i++) {
            const req = createReq({ customer_id: rateLimitCustId, body: {} })
            const res = createRes()
            await POST(req, res as any)
            expect(res._status).toBe(400)
        }

        // 6th call should be rate-limited
        const req = createReq({ customer_id: rateLimitCustId, body: {} })
        const res = createRes()
        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(429)
        expect(res._json.message).toMatch(/too many/i)
    })

    it("returns 500 when createProductReviews throws", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockRejectedValue(new Error("DB write error")),
        })
        const req = createReq({
            customer_id: "cust_p16",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })

    it("checks for duplicate review with correct filter", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_dup" }]),
        })
        const req = createReq({
            customer_id: "cust_p17",
            body: { product_id: "prod_dup", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(reviewSvc.listProductReviews).toHaveBeenCalledWith({
            product_id: "prod_dup",
            customer_id: "cust_p17",
        })
    })

    // ── New: unique constraint violation (race condition catch) ────

    it("returns 409 when DB throws a PostgreSQL unique constraint violation (code 23505)", async () => {
        const uniqueViolationError = Object.assign(new Error("duplicate key"), { code: "23505" })
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockRejectedValue(uniqueViolationError),
        })
        const req = createReq({
            customer_id: "cust_race",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res._json.message).toMatch(/already reviewed/i)
    })

    it("returns 409 when DB error detail mentions 'already exists' (constraint violation variant)", async () => {
        const uniqueViolationError = Object.assign(new Error("unique violation"), {
            detail: "Key (product_id, customer_id)=(prod_1, cust_race2) already exists.",
        })
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockRejectedValue(uniqueViolationError),
        })
        const req = createReq({
            customer_id: "cust_race2",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res._json.message).toMatch(/already reviewed/i)
    })

    it("returns 500 (not 409) when createProductReviews throws a non-unique error", async () => {
        const otherError = Object.assign(new Error("DB write error"), { code: "42000" })
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockRejectedValue(otherError),
        })
        const req = createReq({
            customer_id: "cust_p16b",
            body: { product_id: "prod_1", author_name: "John", content: "Good", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })

    // ── New: sanitize-html bypass tests (stronger than regex) ─────

    it("strips HTML entities that bypass regex but sanitize-html catches", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_entity" }),
        })
        const req = createReq({
            customer_id: "cust_entity",
            body: {
                product_id: "prod_1",
                author_name: "John",
                content: "Great &#60;script&#62;alert(1)&#60;/script&#62; product!",
                rating: 5,
            },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        const payload = reviewSvc.createProductReviews.mock.calls[0][0]
        // sanitize-html decodes entities and strips the resulting tags
        expect(payload.content).not.toContain("<script>")
        expect(payload.content).not.toContain("&#60;")
    })

    it("strips malformed tags that slip past naive regex", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
            createProductReviews: jest.fn().mockResolvedValue({ id: "rev_malformed" }),
        })
        const req = createReq({
            customer_id: "cust_malformed",
            body: {
                product_id: "prod_1",
                author_name: "John",
                // malformed tag with text after — sanitize-html strips the tag, keeps the text
                content: "Good product! <img src=x onerror=alert(1)>",
                rating: 5,
            },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        const payload = reviewSvc.createProductReviews.mock.calls[0][0]
        expect(payload.content).not.toContain("onerror")
        expect(payload.content).not.toContain("<img")
        expect(payload.content).toContain("Good product!")
    })
})

// ─────────────────────────────────────────────────────────────────
// PUT /store/custom/reviews
// ─────────────────────────────────────────────────────────────────

describe("PUT /store/custom/reviews", () => {
    it("returns 401 when not authenticated (no customer_id)", async () => {
        const req = createReq({ body: { review_id: "rev_1" } })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res._json.message).toMatch(/authentication/i)
    })

    it("returns 400 when review_id is missing", async () => {
        const req = createReq({ customer_id: "cust_u1", body: {} })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/review_id/i)
    })

    it("returns 400 when review_id is not a string", async () => {
        const req = createReq({ customer_id: "cust_u2", body: { review_id: 123 } })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/review_id/i)
    })

    it("returns 404 when review does not exist", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_u3",
            body: { review_id: "rev_ghost" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(404)
        expect(res._json.message).toMatch(/not found/i)
    })

    it("returns 403 when customer does not own the review", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([
                { id: "rev_1", customer_id: "cust_someone_else" },
            ]),
        })
        const req = createReq({
            customer_id: "cust_u4",
            body: { review_id: "rev_1", content: "Trying to edit" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res._json.message).toMatch(/your own/i)
    })

    it("returns 400 when no updatable fields are provided", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([
                { id: "rev_1", customer_id: "cust_u5" },
            ]),
        })
        const req = createReq({
            customer_id: "cust_u5",
            body: { review_id: "rev_1" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/no fields/i)
    })

    it("successfully updates content only", async () => {
        const updated = { id: "rev_1", content: "Updated content" }
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u6" }]),
            updateProductReviews: jest.fn().mockResolvedValue(updated),
        })
        const req = createReq({
            customer_id: "cust_u6",
            body: { review_id: "rev_1", content: "Updated content" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.review).toEqual(updated)
        expect(reviewSvc.updateProductReviews).toHaveBeenCalledWith({
            id: "rev_1",
            content: "Updated content",
        })
    })

    it("successfully updates rating only", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u7" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1", rating: 3 }),
        })
        const req = createReq({
            customer_id: "cust_u7",
            body: { review_id: "rev_1", rating: 3 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(reviewSvc.updateProductReviews).toHaveBeenCalledWith({
            id: "rev_1",
            rating: 3,
        })
    })

    it("successfully updates author_name only", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u8" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1", author_name: "New Name" }),
        })
        const req = createReq({
            customer_id: "cust_u8",
            body: { review_id: "rev_1", author_name: "New Name" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(reviewSvc.updateProductReviews).toHaveBeenCalledWith({
            id: "rev_1",
            author_name: "New Name",
        })
    })

    it("successfully updates multiple fields at once", async () => {
        const updated = { id: "rev_1", author_name: "Updated", rating: 2, content: "Changed" }
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u9" }]),
            updateProductReviews: jest.fn().mockResolvedValue(updated),
        })
        const req = createReq({
            customer_id: "cust_u9",
            body: { review_id: "rev_1", author_name: "Updated", rating: 2, content: "Changed" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.review).toEqual(updated)
        expect(reviewSvc.updateProductReviews).toHaveBeenCalledWith({
            id: "rev_1",
            author_name: "Updated",
            rating: 2,
            content: "Changed",
        })
    })

    // ──────────────────────────────────────────────────────────────
    // REGRESSION: The old code passed (review_id, payload) as two
    // separate arguments to updateProductReviews. MedusaService's
    // auto-generated update methods expect a SINGLE object with `id`
    // embedded: { id, ...fields }.
    // ──────────────────────────────────────────────────────────────

    it("REGRESSION — calls updateProductReviews with a single { id, ...fields } object", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([
                { id: "rev_regression", customer_id: "cust_regression" },
            ]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_regression" }),
        })
        const req = createReq({
            customer_id: "cust_regression",
            body: { review_id: "rev_regression", content: "Regression content", rating: 5 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        // The mock must have been called exactly once
        expect(reviewSvc.updateProductReviews).toHaveBeenCalledTimes(1)

        // CRITICAL: must receive exactly ONE argument (a single object)
        const callArgs = reviewSvc.updateProductReviews.mock.calls[0]
        expect(callArgs).toHaveLength(1)

        // The single argument must be an object containing `id`
        const singleArg = callArgs[0]
        expect(typeof singleArg).toBe("object")
        expect(singleArg).not.toBeNull()
        expect(singleArg).toHaveProperty("id", "rev_regression")
        expect(singleArg).toHaveProperty("content", "Regression content")
        expect(singleArg).toHaveProperty("rating", 5)

        // Ensure `id` is a property on the object, NOT a separate positional argument
        // (the old broken call was: updateProductReviews("rev_regression", { content, rating }))
        expect(typeof callArgs[0]).not.toBe("string")
    })

    it("REGRESSION — the first argument is NOT a plain string ID", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([
                { id: "rev_r2", customer_id: "cust_r2" },
            ]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_r2" }),
        })
        const req = createReq({
            customer_id: "cust_r2",
            body: { review_id: "rev_r2", author_name: "Test" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        const firstArg = reviewSvc.updateProductReviews.mock.calls[0][0]
        // Must be an object, not a string (the old broken pattern)
        expect(typeof firstArg).toBe("object")
        expect(firstArg.id).toBe("rev_r2")
    })

    it("sanitises HTML in updated content", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u10" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1" }),
        })
        const req = createReq({
            customer_id: "cust_u10",
            body: { review_id: "rev_1", content: "<b>Bold</b> text <script>alert(1)</script>" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        const arg = reviewSvc.updateProductReviews.mock.calls[0][0]
        // sanitize-html strips <script> tags AND their content
        expect(arg.content).toBe("Bold text")
        expect(arg.content).not.toContain("<")
    })

    it("sanitises HTML in updated author_name", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u11" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1" }),
        })
        const req = createReq({
            customer_id: "cust_u11",
            body: { review_id: "rev_1", author_name: "<i>Name</i>" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        const arg = reviewSvc.updateProductReviews.mock.calls[0][0]
        expect(arg.author_name).toBe("Name")
        expect(arg.author_name).not.toContain("<")
    })

    it("validates rating range on update (rejects > 5)", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u12" }]),
        })
        const req = createReq({
            customer_id: "cust_u12",
            body: { review_id: "rev_1", rating: 10 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("validates rating range on update (rejects < 1)", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u13" }]),
        })
        const req = createReq({
            customer_id: "cust_u13",
            body: { review_id: "rev_1", rating: 0 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("validates rating range on update (rejects non-numeric string)", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u14" }]),
        })
        const req = createReq({
            customer_id: "cust_u14",
            body: { review_id: "rev_1", rating: "bad" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/rating/i)
    })

    it("rejects empty content on update (whitespace only)", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u15" }]),
        })
        const req = createReq({
            customer_id: "cust_u15",
            body: { review_id: "rev_1", content: "   " },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/content/i)
    })

    it("rejects empty author_name on update", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u16" }]),
        })
        const req = createReq({
            customer_id: "cust_u16",
            body: { review_id: "rev_1", author_name: "" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/author_name/i)
    })

    it("rounds decimal rating on update", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u17" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1" }),
        })
        const req = createReq({
            customer_id: "cust_u17",
            body: { review_id: "rev_1", rating: 4.6 },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(reviewSvc.updateProductReviews.mock.calls[0][0].rating).toBe(5)
    })

    it("parses string rating on update", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u18" }]),
            updateProductReviews: jest.fn().mockResolvedValue({ id: "rev_1" }),
        })
        const req = createReq({
            customer_id: "cust_u18",
            body: { review_id: "rev_1", rating: "3" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res._status).toBe(200)
        expect(reviewSvc.updateProductReviews.mock.calls[0][0].rating).toBe(3)
    })

    it("returns 500 when updateProductReviews throws", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([{ id: "rev_1", customer_id: "cust_u19" }]),
            updateProductReviews: jest.fn().mockRejectedValue(new Error("DB write error")),
        })
        const req = createReq({
            customer_id: "cust_u19",
            body: { review_id: "rev_1", content: "Updated" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })

    it("looks up existing review by id", async () => {
        const reviewSvc = mockReviewService({
            listProductReviews: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_u20",
            body: { review_id: "rev_lookup" },
            scope: scopeResolving({ reviewModule: reviewSvc }),
        })
        const res = createRes()

        await PUT(req, res as any)

        expect(reviewSvc.listProductReviews).toHaveBeenCalledWith({ id: "rev_lookup" })
    })
})
