import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /store/custom/fix-inventory-now
 * 
 * Immediately fix inventory sync without needing direct DB access
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const inventoryModuleService = req.scope.resolve(Modules.INVENTORY)
    
    console.log("\n🔧 Fixing inventory sync...")

    const inventoryItemId = "iitem_01K7E93C5X154Y3PGC5X80PF7P"
    const locationId = "sloc_01K7EB91C00HF74G6YK24PEVCZ"

    // Get all reservations
    const reservations = await inventoryModuleService.listReservationItems({
      inventory_item_id: inventoryItemId,
      location_id: locationId
    })

    // Calculate correct total
    const correctReservedTotal = reservations.reduce((sum, r) => sum + (r.quantity || 0), 0)
    console.log(`Total reservations: ${reservations.length}, Total quantity: ${correctReservedTotal}`)

    // Get current inventory level
    const levels = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: locationId
    })

    const currentReserved = levels[0]?.reserved_quantity || 0
    console.log(`Current reserved_quantity in inventory_level: ${currentReserved}`)

    if (currentReserved !== correctReservedTotal) {
      console.log(`❌ OUT OF SYNC! Should be ${correctReservedTotal} but is ${currentReserved}`)
      console.log(`🔧 Updating inventory level...`)

      // Update the inventory level
      await inventoryModuleService.updateInventoryLevels([{
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        reserved_quantity: correctReservedTotal
      }])

      console.log(`✅ Updated reserved_quantity to ${correctReservedTotal}`)
    } else {
      console.log(`✅ Already in sync!`)
    }

    // Get updated state
    const updatedLevels = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: locationId
    })

    const stocked = updatedLevels[0]?.stocked_quantity || 0
    const reserved = updatedLevels[0]?.reserved_quantity || 0
    const available = stocked - reserved

    res.json({
      success: true,
      message: "Inventory sync fixed",
      before: {
        reserved: currentReserved,
        available: (levels[0]?.stocked_quantity || 0) - currentReserved
      },
      after: {
        stocked: stocked,
        reserved: reserved,
        available: available
      },
      reservations: {
        count: reservations.length,
        total_quantity: correctReservedTotal,
        details: reservations.map(r => ({
          id: r.id,
          quantity: r.quantity,
          line_item_id: r.line_item_id,
          created_at: r.created_at
        }))
      },
      note: "You still need to run the SQL file to create the auto-sync trigger for future orders"
    })

  } catch (error: any) {
    console.error("Error fixing inventory:", error)
    res.status(500).json({
      error: "Failed to fix inventory",
      message: error.message,
      stack: error.stack
    })
  }
}
