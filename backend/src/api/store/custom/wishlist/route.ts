import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import WishlistModuleService from "../../../../modules/wishlist/service"
import { WISHLIST_MODULE } from "../../../../modules/wishlist"

const PRODUCT_ID_REGEX = /^prod_[a-zA-Z0-9]{1,100}$/

function isValidProductId(id: unknown): id is string {
    return typeof id === "string" && PRODUCT_ID_REGEX.test(id)
}

// GET /store/custom/wishlist — list all wishlist items for authenticated customer
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
    const customerId = (req as any).customer_id as string | undefined
    if (!customerId) {
        res.status(401).json({ message: "Authentication required" })
        return
    }

    try {
        const svc: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
        const items = await svc.listWishlistItems(
            { customer_id: customerId },
            { order: { created_at: "DESC" } }
        )
        res.json({ items: items || [] })
    } catch (error: any) {
        console.error("[Wishlist][GET]", error?.message)
        res.status(500).json({ message: "Failed to fetch wishlist" })
    }
}

// POST /store/custom/wishlist — add product to wishlist (idempotent)
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
    const customerId = (req as any).customer_id as string | undefined
    if (!customerId) {
        res.status(401).json({ message: "Authentication required" })
        return
    }

    const { product_id } = req.body as Record<string, unknown>
    if (!isValidProductId(product_id)) {
        res.status(400).json({ message: "Valid product_id is required (format: prod_xxx)" })
        return
    }

    try {
        const svc: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)

        // Idempotent: return existing if already wishlisted
        const existing = await svc.listWishlistItems({
            customer_id: customerId,
            product_id,
        }) ?? []
        if (existing.length > 0) {
            res.status(200).json({ item: existing[0] })
            return
        }

        const all = await svc.listWishlistItems({ customer_id: customerId }) ?? []
        if (all.length >= 200) { res.status(400).json({ error: 'limit_reached', message: 'Wishlist limit (200) reached' }); return }

        const item = await svc.createWishlistItems({
            customer_id: customerId,
            product_id,
        })
        res.status(201).json({ item })
    } catch (error: any) {
        // Handle unique constraint race condition
        if (error?.code === "23505") {
            res.status(200).json({ message: "Already in wishlist" })
            return
        }
        console.error("[Wishlist][POST]", error?.message)
        res.status(500).json({ message: "Failed to add to wishlist" })
    }
}

// DELETE /store/custom/wishlist — remove product from wishlist (idempotent)
export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
    const customerId = (req as any).customer_id as string | undefined
    if (!customerId) {
        res.status(401).json({ message: "Authentication required" })
        return
    }

    const { product_id } = req.body as Record<string, unknown>
    if (!isValidProductId(product_id)) {
        res.status(400).json({ message: "Valid product_id is required (format: prod_xxx)" })
        return
    }

    try {
        const svc: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
        const existing = await svc.listWishlistItems({
            customer_id: customerId,
            product_id,
        }) ?? []
        if (existing.length > 0) {
            if (existing[0].customer_id !== customerId) { res.status(403).json({ error: 'forbidden' }); return }
            await svc.deleteWishlistItems(existing[0].id)
        }
        res.json({ success: true })
    } catch (error: any) {
        console.error("[Wishlist][DELETE]", error?.message)
        res.status(500).json({ message: "Failed to remove from wishlist" })
    }
}
