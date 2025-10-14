import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const productId = req.params.id

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const inventoryModuleService = req.scope.resolve(Modules.INVENTORY)

    // Get product with variants
    const products = await productModuleService.listProducts({
      id: productId
    }, {
      relations: ["variants"]
    })

    if (!products || products.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    const product = products[0]
    const inventoryData: Record<string, any> = {}

    // Get inventory for each variant
    for (const variant of product.variants || []) {
      let totalAvailable = 0
      
      // Get inventory items for this variant
      const inventoryItems = await inventoryModuleService.listInventoryItems({
        sku: variant.sku
      })

      for (const item of inventoryItems) {
        // Get inventory levels for this item
        const levels = await inventoryModuleService.listInventoryLevels({
          inventory_item_id: item.id
        })

        for (const level of levels) {
          const stocked = level.stocked_quantity || 0
          const reserved = level.reserved_quantity || 0
          totalAvailable += Math.max(0, stocked - reserved)
        }
      }

      inventoryData[variant.id] = {
        variant_id: variant.id,
        sku: variant.sku,
        available: totalAvailable,
        in_stock: totalAvailable > 0 || variant.allow_backorder,
        manage_inventory: variant.manage_inventory,
        allow_backorder: variant.allow_backorder,
        // Provide v1-style inventory_quantity for compatibility
        inventory_quantity: totalAvailable
      }
    }

    res.json({
      product_id: productId,
      inventory: inventoryData
    })
  } catch (error) {
    console.error("Error fetching inventory:", error)
    res.status(500).json({
      error: "Failed to fetch inventory",
      message: error.message
    })
  }
}
