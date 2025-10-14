/**
 * Cleanup Phantom Reservations Script
 * 
 * Removes invalid/phantom reservations that have:
 * - No line_item_id
 * - No order_id  
 * - Invalid SKU like "facility"
 * 
 * Run with: npm run medusa exec -- ./src/scripts/cleanup-phantom-reservations.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function cleanupPhantomReservations({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("[Cleanup] Starting phantom reservation cleanup...")

  try {
    // Query all reservations
    const { data: allReservations } = await query.graph({
      entity: "reservation",
      fields: ["id", "sku", "line_item_id", "inventory_item_id", "quantity", "created_at"],
    })

    logger.info(`[Cleanup] Found ${allReservations.length} total reservations`)

    // Identify phantom reservations
    const phantomReservations = allReservations.filter((reservation: any) => {
      // Phantom if: no line_item_id AND (invalid SKU OR no inventory_item_id)
      const noLineItem = !reservation.line_item_id
      const invalidSku = reservation.sku === 'facility' || reservation.sku === 'test' || !reservation.sku
      const noInventoryItem = !reservation.inventory_item_id

      return noLineItem && (invalidSku || noInventoryItem)
    })

    logger.info(`[Cleanup] Found ${phantomReservations.length} phantom reservations to remove`)

    if (phantomReservations.length === 0) {
      logger.info("[Cleanup] No phantom reservations found. Database is clean!")
      return
    }

    // Log details before deletion
    phantomReservations.forEach((reservation: any, index: number) => {
      logger.info(`[Cleanup] Phantom #${index + 1}: sku="${reservation.sku}", quantity=${reservation.quantity}, created_at=${reservation.created_at}`)
    })

    // Delete phantom reservations
    logger.info("[Cleanup] Deleting phantom reservations...")
    
    const phantomIds = phantomReservations.map((r: any) => r.id)
    
    // Use raw SQL to delete (Medusa doesn't expose reservation delete API easily)
    const knex = container.resolve("db:connection")
    const deletedCount = await knex('reservation')
      .whereIn('id', phantomIds)
      .del()

    logger.info(`[Cleanup] Successfully deleted ${deletedCount} phantom reservations`)
    logger.info("[Cleanup] Cleanup complete!")

    // Summary
    logger.info("\n" + "=".repeat(60))
    logger.info("CLEANUP SUMMARY")
    logger.info("=".repeat(60))
    logger.info(`Total reservations scanned: ${allReservations.length}`)
    logger.info(`Phantom reservations found: ${phantomReservations.length}`)
    logger.info(`Phantom reservations deleted: ${deletedCount}`)
    logger.info(`Healthy reservations remaining: ${allReservations.length - deletedCount}`)
    logger.info("=".repeat(60))

  } catch (error) {
    logger.error("[Cleanup] Error during phantom reservation cleanup:", error)
    throw error
  }
}
