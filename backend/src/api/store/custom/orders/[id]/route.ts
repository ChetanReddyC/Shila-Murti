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
          "billing_address.*",
          "shipping_methods.*",
          "fulfillments.*",
          "fulfillments.labels.*",
          "payment_collections.*",
          "payment_collections.payments.*"
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
          console.log("[CUSTOM_ORDER_BY_ID][ITEMS_FETCHED_VIA_RQ]", { 
            itemCount: fullOrder.items.length,
            firstItem: {
              id: fullOrder.items[0].id,
              title: fullOrder.items[0].title,
              thumbnail: fullOrder.items[0].thumbnail,
              unit_price: fullOrder.items[0].unit_price,
              quantity: fullOrder.items[0].quantity,
              hasVariant: !!fullOrder.items[0].variant,
              variantTitle: fullOrder.items[0].variant?.title,
              productTitle: fullOrder.items[0].variant?.product?.title,
              productThumbnail: fullOrder.items[0].variant?.product?.thumbnail,
              keys: Object.keys(fullOrder.items[0])
            }
          })
        }
        
        // Merge the additional data into our order object
        if (fullOrder.shipping_methods) {
          order.shipping_methods = fullOrder.shipping_methods
          console.log("[CUSTOM_ORDER_BY_ID][SHIPPING_FETCHED_VIA_RQ]", { count: fullOrder.shipping_methods.length })
        }
        
        if (fullOrder.fulfillments) {
          order.fulfillments = fullOrder.fulfillments
          console.log("[CUSTOM_ORDER_BY_ID][FULFILLMENTS_FETCHED_VIA_RQ]", { count: fullOrder.fulfillments.length })
        }
        
        if (fullOrder.payment_collections) {
          order.payment_collections = fullOrder.payment_collections
          console.log("[CUSTOM_ORDER_BY_ID][PAYMENTS_FETCHED_VIA_RQ]", { count: fullOrder.payment_collections.length })
        }
      }
    } catch (remoteQueryError: any) {
      console.warn("[CUSTOM_ORDER_BY_ID][REMOTE_QUERY_ERROR]", remoteQueryError?.message)
    }
    
    console.log("[CUSTOM_ORDER_BY_ID][FOUND]", {
      orderId: order.id,
      customerId: order.customer_id,
      hasItems: !!order.items,
      itemCount: order.items?.length || 0,
      hasFulfillments: !!order.fulfillments,
      fulfillmentCount: order.fulfillments?.length || 0,
      hasPaymentCollections: !!order.payment_collections,
      paymentCount: order.payment_collections?.length || 0,
      hasShippingMethods: !!order.shipping_methods,
      shippingMethodCount: order.shipping_methods?.length || 0,
      hasShippingAddress: !!order.shipping_address,
      hasBillingAddress: !!order.billing_address,
      financials: {
        subtotal: order.subtotal,
        shipping_total: order.shipping_total,
        tax_total: order.tax_total,
        total: order.total,
        currency_code: order.currency_code
      },
      keys: Object.keys(order).slice(0, 30) // Limit keys output
    })

    return res.status(200).json({ order })
  } catch (error: any) {
    console.error("[CUSTOM_ORDER_BY_ID][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
