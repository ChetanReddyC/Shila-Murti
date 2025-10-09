import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../utils/jwt"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Extract and verify JWT token
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    // Get order ID from URL params
    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    // Fetch the specific order
    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    // First, get the basic order to verify ownership
    const orders = await orderModuleService.listOrders({
      id: orderId,
      customer_id: customerId,
    }, {
      take: 1,
    })
    
    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: "Order not found" })
    }
    
    let order = orders[0]
    
    // Manually fetch order items, fulfillments, and payment collections using separate queries
    // since relations aren't working with this Medusa version
    
    // Don't query items separately since remoteQuery will handle them better
    // The items query was only returning minimal data
    
    // Use remote query to fetch related data from link tables
    try {
      const remoteQuery = req.scope.resolve("remoteQuery")
      
      // Fetch order with all related data using remote query
      const fullOrderData = await remoteQuery({
        entryPoint: "order",
        fields: [
          "id",
          "display_id",
          "status",
          "created_at",
          "currency_code",
          "email",
          "subtotal",
          "shipping_total",
          "tax_total",
          "total",
          "item_total",
          "discount_total",
          "fulfillment_status",
          "payment_status",
          "items.*",
          "items.variant.*",
          "items.variant.product.*",
          "shipping_address.*",
          "shipping_methods.*",
          "fulfillments.*",
          "fulfillments.labels.*",
          "payment_collections.*",
          "payment_collections.payments.*",
          "customer.*"
        ],
        variables: {
          filters: { id: orderId }
        }
      })
      
      if (fullOrderData && fullOrderData.length > 0) {
        const fullOrder = fullOrderData[0]
        
        // Convert BigNumber fields to regular numbers
        const convertBigNumber = (value: any) => {
          if (value && typeof value === 'object' && 'numeric_' in value) {
            return value.numeric_
          }
          return value
        }
        
        // Merge all top-level order fields from remoteQuery
        // This includes financial fields like subtotal, shipping_total, tax_total, total
        Object.assign(order, fullOrder)
        
        // Convert BigNumber financial fields to plain numbers
        if (order.subtotal) order.subtotal = convertBigNumber(order.subtotal)
        if (order.shipping_total) order.shipping_total = convertBigNumber(order.shipping_total)
        if (order.tax_total) order.tax_total = convertBigNumber(order.tax_total)
        if (order.total) order.total = convertBigNumber(order.total)
        if (order.item_total) order.item_total = convertBigNumber(order.item_total)
        if (order.discount_total) order.discount_total = convertBigNumber(order.discount_total)
        
        // Replace items with full data from remoteQuery
        if (fullOrder.items && fullOrder.items.length > 0) {
          order.items = fullOrder.items
        }
        
        // Merge the additional data into our order object
        if (fullOrder.shipping_methods) {
          order.shipping_methods = fullOrder.shipping_methods
        }
        
        if (fullOrder.fulfillments) {
          order.fulfillments = fullOrder.fulfillments
        }
        
        if (fullOrder.payment_collections) {
          order.payment_collections = fullOrder.payment_collections
        }
        
        if (fullOrder.customer) {
          order.customer = fullOrder.customer
        }
        
        // Derive payment_status from payment_collections
        if (order.payment_collections && order.payment_collections.length > 0) {
          const paymentCollection = order.payment_collections[0]
          const payment = paymentCollection.payments?.[0]
          
          if (payment?.captured_at) {
            order.payment_status = "captured"
          } else if (paymentCollection.status === "completed") {
            order.payment_status = "captured"
          } else if (paymentCollection.status === "awaiting" || paymentCollection.status === "pending") {
            order.payment_status = "awaiting"
          } else if (payment?.canceled_at) {
            order.payment_status = "canceled"
          } else {
            order.payment_status = "not_paid"
          }

        }
        
        // Derive fulfillment_status from fulfillments
        if (order.fulfillments && order.fulfillments.length > 0) {
          const fulfillment = order.fulfillments[0]
          
          if (fulfillment.delivered_at) {
            order.fulfillment_status = "delivered"
          } else if (fulfillment.shipped_at) {
            order.fulfillment_status = "shipped"
          } else if (fulfillment.canceled_at) {
            order.fulfillment_status = "canceled"
          } else if (fulfillment.packed_at) {
            order.fulfillment_status = "partially_fulfilled"
          } else {
            order.fulfillment_status = "not_fulfilled"
          }
        } else {
          order.fulfillment_status = "not_fulfilled"
        }
      }
    } catch (remoteQueryError: any) {
      console.warn("[CUSTOM_ORDER_BY_ID][REMOTE_QUERY_ERROR]", remoteQueryError?.message)
    }
    


    return res.status(200).json({ order })
  } catch (error: any) {
    console.error("[CUSTOM_ORDER_BY_ID][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
