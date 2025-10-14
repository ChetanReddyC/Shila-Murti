/**
 * Monitor Reservations Script
 * 
 * Displays a report of all inventory reservations to help identify issues
 * 
 * Run with: npm run medusa exec -- ./src/scripts/monitor-reservations.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function monitorReservations({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("\n" + "=".repeat(80))
  logger.info("INVENTORY RESERVATIONS REPORT")
  logger.info("=".repeat(80))

  try {
    // Get all reservations
    const { data: reservations } = await query.graph({
      entity: "reservation",
      fields: [
        "id", 
        "sku", 
        "line_item_id", 
        "inventory_item_id", 
        "location_id",
        "quantity", 
        "created_at",
        "metadata"
      ],
    })

    logger.info(`\nTotal Reservations: ${reservations.length}\n`)

    // Categorize reservations
    const healthy = reservations.filter((r: any) => r.line_item_id && r.inventory_item_id)
    const suspicious = reservations.filter((r: any) => !r.line_item_id || !r.inventory_item_id)
    const phantom = reservations.filter((r: any) => 
      !r.line_item_id && (!r.sku || r.sku === 'facility' || r.sku === 'test')
    )

    logger.info("CATEGORIES:")
    logger.info(`  ✅ Healthy (with line_item_id): ${healthy.length}`)
    logger.info(`  ⚠️  Suspicious (missing data): ${suspicious.length}`)
    logger.info(`  ❌ Phantom (invalid/orphaned): ${phantom.length}`)

    if (phantom.length > 0) {
      logger.info("\n" + "-".repeat(80))
      logger.info("PHANTOM RESERVATIONS (should be deleted):")
      logger.info("-".repeat(80))
      phantom.forEach((r: any, i: number) => {
        logger.info(`\n${i + 1}. Reservation ID: ${r.id}`)
        logger.info(`   SKU: ${r.sku || 'N/A'}`)
        logger.info(`   Quantity: ${r.quantity}`)
        logger.info(`   Location: ${r.location_id || 'N/A'}`)
        logger.info(`   Created: ${r.created_at}`)
        logger.info(`   Line Item: ${r.line_item_id || 'MISSING'}`)
        logger.info(`   Inventory Item: ${r.inventory_item_id || 'MISSING'}`)
      })
      
      logger.info("\n" + "=".repeat(80))
      logger.info("⚠️  ACTION REQUIRED:")
      logger.info("Run cleanup script to remove phantom reservations:")
      logger.info("npm run medusa exec -- ./src/scripts/cleanup-phantom-reservations.ts")
      logger.info("=".repeat(80))
    }

    if (suspicious.length > 0 && phantom.length === 0) {
      logger.info("\n" + "-".repeat(80))
      logger.info("SUSPICIOUS RESERVATIONS (review needed):")
      logger.info("-".repeat(80))
      suspicious.slice(0, 10).forEach((r: any, i: number) => {
        logger.info(`\n${i + 1}. Reservation ID: ${r.id}`)
        logger.info(`   SKU: ${r.sku}`)
        logger.info(`   Quantity: ${r.quantity}`)
        logger.info(`   Line Item: ${r.line_item_id || 'MISSING'}`)
        logger.info(`   Inventory Item: ${r.inventory_item_id || 'MISSING'}`)
      })
      if (suspicious.length > 10) {
        logger.info(`\n... and ${suspicious.length - 10} more`)
      }
    }

    if (phantom.length === 0 && suspicious.length === 0) {
      logger.info("\n✅ All reservations look healthy!")
    }

    logger.info("\n" + "=".repeat(80))

  } catch (error) {
    logger.error("[Monitor] Error monitoring reservations:", error)
    throw error
  }
}
