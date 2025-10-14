import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../utils/jwt"

interface CursorData {
  created_at: string
  id: string
}

function decodeCursor(cursor: string | null): CursorData | null {
  if (!cursor) return null
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function encodeCursor(created_at: string, id: string): string {
  const data: CursorData = { created_at, id }
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer, req.scope)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10'), 1), 50)
    const cursorParam = url.searchParams.get('cursor')
    const searchQuery = url.searchParams.get('search')?.trim()
    const cursor = decodeCursor(cursorParam)

    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    const filters: any = { customer_id: customerId }
    
    if (searchQuery) {
      filters.$or = [
        { display_id: { $ilike: `%${searchQuery}%` } },
        { status: { $ilike: `%${searchQuery}%` } },
        { fulfillment_status: { $ilike: `%${searchQuery}%` } }
      ]
    }

    if (cursor) {
      filters.$or = filters.$or || []
      const cursorFilters = [
        { created_at: { $lt: cursor.created_at } },
        {
          created_at: cursor.created_at,
          id: { $lt: cursor.id }
        }
      ]
      if (filters.$or.length > 0) {
        filters.$and = [
          { $or: filters.$or },
          { $or: cursorFilters }
        ]
        delete filters.$or
      } else {
        filters.$or = cursorFilters
      }
    }

    let orders: any[] = []
    
    try {
      orders = await orderModuleService.listOrders(filters, {
        relations: [
          "items",
          "items.variant",
          "items.variant.product",
          "shipping_address",
          "billing_address",
          "shipping_methods",
          "payment_collections",
          "payment_collections.payments",
          "fulfillments",
          "fulfillments.labels"
        ],
        take: limit + 1,
        order: { created_at: 'DESC', id: 'DESC' }
      })
    } catch (relationError: any) {
      console.warn("[CUSTOM_ORDERS_ROUTE][RELATION_ERROR]", relationError?.message)
      orders = await orderModuleService.listOrders(filters, {
        take: limit + 1,
        order: { created_at: 'DESC', id: 'DESC' }
      })
    }
    
    const hasMore = orders.length > limit
    const resultOrders = hasMore ? orders.slice(0, limit) : orders
    
    let nextCursor: string | null = null
    if (hasMore && resultOrders.length > 0) {
      const lastOrder = resultOrders[resultOrders.length - 1]
      nextCursor = encodeCursor(lastOrder.created_at, lastOrder.id)
    }

    console.log("[CUSTOM_ORDERS_ROUTE][PAGINATED]", {
      total: resultOrders.length,
      hasMore,
      cursor: !!cursor,
      search: !!searchQuery
    })
    
    return res.status(200).json({
      orders: resultOrders,
      nextCursor,
      hasMore
    })
  } catch (error: any) {
    console.error("[CUSTOM_ORDERS_ROUTE][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
