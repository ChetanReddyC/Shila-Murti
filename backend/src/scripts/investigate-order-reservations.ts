import { MedusaContainer, Modules } from "@medusajs/framework/utils"

/**
 * Investigate what's happening with reservations after order placement
 * 
 * Run with: npx medusa exec ./src/scripts/investigate-order-reservations.ts
 */
export default async function investigateOrderReservations({ container }: { container: MedusaContainer }) {
  const inventoryModuleService = container.resolve(Modules.INVENTORY)
  const orderModuleService = container.resolve(Modules.ORDER)
  const query = container.resolve("query")

  console.log("\n🔍 Investigating reservation behavior after order placement...")

  try {
    const inventoryItemId = "iitem_01K7E93C5X154Y3PGC5X80PF7P"
    const variantId = "variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1"

    // Get all reservations for this inventory item
    const reservations = await inventoryModuleService.listReservationItems({
      inventory_item_id: inventoryItemId
    })

    console.log(`\n📊 Found ${reservations.length} reservation(s) for PURE-BLACK-ABSTRACT:\n`)

    for (const reservation of reservations) {
      console.log(`Reservation ID: ${reservation.id}`)
      console.log(`  Quantity: ${reservation.quantity}`)
      console.log(`  Line Item ID: ${reservation.line_item_id}`)
      console.log(`  Location ID: ${reservation.location_id}`)
      console.log(`  Created: ${reservation.created_at}`)

      // Get the associated line item details
      if (reservation.line_item_id) {
        try {
          const lineItemResult: any = await query.graph(`
            query {
              order_line_item(where: {id: {eq: "${reservation.line_item_id}"}}) {
                id
                quantity
                variant_id
                order_id
                created_at
              }
            }
          `)

          if (lineItemResult?.order_line_item?.[0]) {
            const lineItem = lineItemResult.order_line_item[0]
            console.log(`  Line Item Quantity: ${lineItem.quantity}`)
            console.log(`  Order ID: ${lineItem.order_id}`)
            
            const mismatch = lineItem.quantity !== reservation.quantity
            if (mismatch) {
              console.log(`  ⚠️  MISMATCH: Reserved ${reservation.quantity} but line item is ${lineItem.quantity}`)
            }

            // Get order status
            const orders = await orderModuleService.listOrders({ id: lineItem.order_id })
            if (orders && orders.length > 0) {
              console.log(`  Order Status: ${orders[0].status}`)
              console.log(`  Order Payment Status: ${orders[0].payment_status}`)
              console.log(`  Order Fulfillment Status: ${orders[0].fulfillment_status}`)
            }
          }
        } catch (lineError: any) {
          console.log(`  ❌ Error getting line item: ${lineError.message}`)
        }
      }
      console.log("")
    }

    // Check inventory levels
    const levels = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: inventoryItemId
    })

    if (levels && levels.length > 0) {
      console.log("📦 Current Inventory Level:")
      console.log(`  Stocked: ${levels[0].stocked_quantity}`)
      console.log(`  Reserved: ${levels[0].reserved_quantity}`)
      console.log(`  Available: ${levels[0].stocked_quantity - levels[0].reserved_quantity}`)
    }

    // Check if our trigger exists
    console.log("\n🔍 Checking if auto-fix trigger exists in database...")
    try {
      const triggerCheck: any = await query.graph(`
        query {
          pg_trigger(where: {tgname: {eq: "prevent_phantom_reservations"}}) {
            tgname
            tgenabled
          }
        }
      `)
      
      if (triggerCheck?.pg_trigger?.[0]) {
        console.log("✅ Trigger 'prevent_phantom_reservations' exists")
        console.log(`   Enabled: ${triggerCheck.pg_trigger[0].tgenabled}`)
      } else {
        console.log("❌ Trigger 'prevent_phantom_reservations' NOT FOUND!")
        console.log("   This is why phantom reservations keep happening!")
      }
    } catch (triggerError: any) {
      console.log("⚠️  Cannot check trigger (may need direct DB access):", triggerError.message)
    }

    console.log("\n✅ Investigation complete!")

  } catch (error: any) {
    console.error("\n❌ Error:", error.message)
    console.error(error.stack)
  }
}
