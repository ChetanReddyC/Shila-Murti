/**
 * Unit tests for the Wishlist API route handlers (GET, POST, DELETE).
 *
 * Covers authentication, validation, idempotency, error handling,
 * and the unique-constraint race-condition guard in POST.
 *
 * Run with:
 *   npx jest src/api/store/custom/wishlist/__tests__/route.test.ts
 */

// ── Module mocks (hoisted before all imports) ────────────────────

jest.mock("@medusajs/framework/http", () => ({}))
jest.mock("@medusajs/framework/utils", () => ({}))
jest.mock("../../../../../modules/wishlist/service", () => jest.fn())
jest.mock("../../../../../modules/wishlist", () => ({
    WISHLIST_MODULE: "wishlistModule",
}))

import { GET, POST, DELETE } from "../route"

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

function mockWishlistService(overrides: Record<string, any> = {}) {
    return {
        listWishlistItems: jest.fn().mockResolvedValue([]),
        createWishlistItems: jest.fn().mockResolvedValue({ id: "wish_new", customer_id: "cust_1", product_id: "prod_1" }),
        deleteWishlistItems: jest.fn().mockResolvedValue(undefined),
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
// GET /store/custom/wishlist
// ─────────────────────────────────────────────────────────────────

describe("GET /store/custom/wishlist", () => {
    it("returns 401 when not authenticated (no customer_id)", async () => {
        const req = createReq()
        const res = createRes()

        await GET(req, res as any)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res._json.message).toMatch(/authentication/i)
    })

    it("returns wishlist items for an authenticated customer", async () => {
        const items = [
            { id: "wish_1", customer_id: "cust_1", product_id: "prod_1", created_at: "2025-01-01" },
            { id: "wish_2", customer_id: "cust_1", product_id: "prod_2", created_at: "2025-01-02" },
        ]
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue(items),
        })
        const req = createReq({
            customer_id: "cust_1",
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.items).toEqual(items)
        expect(res._json.items).toHaveLength(2)
    })

    it("passes correct filter and ordering to listWishlistItems", async () => {
        const wishlistSvc = mockWishlistService()
        const req = createReq({
            customer_id: "cust_42",
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(wishlistSvc.listWishlistItems).toHaveBeenCalledWith(
            { customer_id: "cust_42" },
            { order: { created_at: "DESC" } },
        )
    })

    it("returns empty array when customer has no wishlist items", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_empty",
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.items).toEqual([])
    })

    it("returns 500 when listWishlistItems throws", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockRejectedValue(new Error("DB error")),
        })
        const req = createReq({
            customer_id: "cust_err",
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await GET(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })
})

// ─────────────────────────────────────────────────────────────────
// POST /store/custom/wishlist
// ─────────────────────────────────────────────────────────────────

describe("POST /store/custom/wishlist", () => {
    it("returns 401 when not authenticated (no customer_id)", async () => {
        const req = createReq({ body: { product_id: "prod_1" } })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res._json.message).toMatch(/authentication/i)
    })

    it("returns 400 when product_id is missing", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: {},
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is not a string", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: 12345 },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is an empty string", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "" },
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("adds product to wishlist and returns 201", async () => {
        const createdItem = { id: "wish_new", customer_id: "cust_1", product_id: "prod_1" }
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
            createWishlistItems: jest.fn().mockResolvedValue(createdItem),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_1" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(201)
        expect(res._json.item).toEqual(createdItem)
        expect(wishlistSvc.createWishlistItems).toHaveBeenCalledWith({
            customer_id: "cust_1",
            product_id: "prod_1",
        })
    })

    it("is idempotent — returns existing item (200) when product already in wishlist", async () => {
        const existingItem = { id: "wish_existing", customer_id: "cust_1", product_id: "prod_1" }
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([existingItem]),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_1" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.item).toEqual(existingItem)
        expect(wishlistSvc.createWishlistItems).not.toHaveBeenCalled()
    })

    it("checks for existing items with correct filter (customer_id + product_id)", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_99",
            body: { product_id: "prod_42" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(wishlistSvc.listWishlistItems).toHaveBeenCalledWith({
            customer_id: "cust_99",
            product_id: "prod_42",
        })
    })

    it("handles unique constraint race condition (code 23505) gracefully", async () => {
        const dbError: any = new Error("duplicate key")
        dbError.code = "23505"
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
            createWishlistItems: jest.fn().mockRejectedValue(dbError),
        })
        const req = createReq({
            customer_id: "cust_race",
            body: { product_id: "prod_race" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.message).toMatch(/already in wishlist/i)
    })

    it("returns 500 when createWishlistItems throws a non-constraint error", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
            createWishlistItems: jest.fn().mockRejectedValue(new Error("Unknown DB error")),
        })
        const req = createReq({
            customer_id: "cust_err",
            body: { product_id: "prod_err" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await POST(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })
})

// ─────────────────────────────────────────────────────────────────
// DELETE /store/custom/wishlist
// ─────────────────────────────────────────────────────────────────

describe("DELETE /store/custom/wishlist", () => {
    it("returns 401 when not authenticated (no customer_id)", async () => {
        const req = createReq({ body: { product_id: "prod_1" } })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res._json.message).toMatch(/authentication/i)
    })

    it("returns 400 when product_id is missing", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: {},
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is not a string", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: 999 },
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("returns 400 when product_id is an empty string", async () => {
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "" },
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res._json.message).toMatch(/product_id/i)
    })

    it("removes product from wishlist and returns success", async () => {
        const existingItem = { id: "wish_del", customer_id: "cust_1", product_id: "prod_1" }
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([existingItem]),
            deleteWishlistItems: jest.fn().mockResolvedValue(undefined),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_1" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.success).toBe(true)
        expect(wishlistSvc.deleteWishlistItems).toHaveBeenCalledWith("wish_del")
    })

    it("looks up existing items with correct filter before deleting", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_77",
            body: { product_id: "prod_77" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(wishlistSvc.listWishlistItems).toHaveBeenCalledWith({
            customer_id: "cust_77",
            product_id: "prod_77",
        })
    })

    it("is idempotent — succeeds even if product is not in wishlist", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([]),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_nonexistent" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res._status).toBe(200)
        expect(res._json.success).toBe(true)
        expect(wishlistSvc.deleteWishlistItems).not.toHaveBeenCalled()
    })

    it("returns 500 when deleteWishlistItems throws", async () => {
        const existingItem = { id: "wish_err", customer_id: "cust_1", product_id: "prod_err" }
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockResolvedValue([existingItem]),
            deleteWishlistItems: jest.fn().mockRejectedValue(new Error("DB error")),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_err" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })

    it("returns 500 when listWishlistItems throws during delete", async () => {
        const wishlistSvc = mockWishlistService({
            listWishlistItems: jest.fn().mockRejectedValue(new Error("lookup failed")),
        })
        const req = createReq({
            customer_id: "cust_1",
            body: { product_id: "prod_1" },
            scope: scopeResolving({ wishlistModule: wishlistSvc }),
        })
        const res = createRes()

        await DELETE(req, res as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res._json.message).toMatch(/failed/i)
    })
})
