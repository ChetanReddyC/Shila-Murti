import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /store/custom/diagnose-inventory/:variant_id
 * 
 * Diagnose why Medusa thinks inventory is insufficient
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const variantId = req.params.variant_id

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const inventoryModuleService = req.scope.resolve(Modules.INVENTORY)
    const salesChannelModuleService = req.scope.resolve(Modules.SALES_CHANNEL)

    // Get variant details
    const variants = await productModuleService.listProductVariants({
      id: variantId
    })

    if (!variants || variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" })
    }

    const variant = variants[0]
    
    // Get inventory items for this variant
    const inventoryItems = await inventoryModuleService.listInventoryItems({
      sku: variant.sku
    })

    const diagnostics: any = {
      variant_id: variantId,
      variant_sku: variant.sku,
      manage_inventory: variant.manage_inventory,
      allow_backorder: variant.allow_backorder,
      inventory_items: []
    }

    // For each inventory item, get all details
    for (const item of inventoryItems) {
      const itemDiag: any = {
        inventory_item_id: item.id,
        sku: item.sku,
        locations: []
      }

      // Get inventory levels
      const levels = await inventoryModuleService.listInventoryLevels({
        inventory_item_id: item.id
      })

      for (const level of levels) {
        // Get reservations for this item at this location
        const reservations = await inventoryModuleService.listReservationItems({
          inventory_item_id: item.id,
          location_id: level.location_id
        })

        const totalReserved = reservations.reduce((sum, r) => sum + (r.quantity || 0), 0)

        itemDiag.locations.push({
          location_id: level.location_id,
          stocked_quantity: level.stocked_quantity,
          reserved_quantity: level.reserved_quantity,
          incoming_quantity: level.incoming_quantity,
          available: level.available_quantity,
          calculated_available: (level.stocked_quantity || 0) - (level.reserved_quantity || 0),
          reservations_count: reservations.length,
          reservations_total: totalReserved,
          reservations: reservations.map(r => ({
            id: r.id,
            quantity: r.quantity,
            line_item_id: r.line_item_id,
            created_at: r.created_at
          }))
        })
      }

      diagnostics.inventory_items.push(itemDiag)
    }

    // Try to check availability using Medusa's method
    try {
      // Get all location IDs where this inventory item exists
      const locationIds = diagnostics.inventory_items[0]?.locations.map((loc: any) => loc.location_id) || []
      
      const availabilityResult = await inventoryModuleService.retrieveAvailableQuantity(
        inventoryItems[0]?.id,
        locationIds
      )
      diagnostics.medusa_availability_check = availabilityResult
      diagnostics.medusa_checked_locations = locationIds
    } catch (availError: any) {
      diagnostics.medusa_availability_check_error = availError.message
    }

    res.json(diagnostics)
  } catch (error: any) {
    console.error("Error diagnosing inventory:", error)
    res.status(500).json({
      error: "Failed to diagnose inventory",
      message: error.message,
      stack: error.stack
    })
  }
}
