/**
 * Automated Orphaned Reservation Cleanup Job
 * 
 * Runs every 6 hours to clean up phantom/orphaned reservations
 * Integrates with Medusa's job scheduler - no external cron needed!
 */

import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function cleanupOrphanedReservationsJob(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("[AutoCleanup] Starting automated orphaned reservation cleanup...")

  try {
    // Get all reservations
    const { data: allReservations } = await query.graph({
      entity: "reservation",
      fields: ["id", "sku", "line_item_id", "inventory_item_id", "quantity", "created_at"],
    })

    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Find orphaned reservations:
    // 1. No line_item_id (not attached to an order)
    // 2. Invalid SKU or no inventory_item_id
    // 3. Older than 24 hours (to avoid deleting in-progress reservations)
    const orphanedReservations = allReservations.filter((reservation: any) => {
      const createdAt = new Date(reservation.created_at)
      const isOld = createdAt < oneDayAgo
      const noLineItem = !reservation.line_item_id
      const invalidSku = !reservation.sku || 
                        reservation.sku === 'facility' || 
                        reservation.sku === 'test' ||
                        reservation.sku === 'placeholder'
      const noInventoryItem = !reservation.inventory_item_id

      return isOld && noLineItem && (invalidSku || noInventoryItem)
    })

    if (orphanedReservations.length === 0) {
      logger.info("[AutoCleanup] No orphaned reservations found. Database is clean!")
      return
    }

    logger.info(`[AutoCleanup] Found ${orphanedReservations.length} orphaned reservations to clean up`)

    // Log what we're cleaning
    orphanedReservations.forEach((reservation: any, index: number) => {
      logger.info(`[AutoCleanup] Orphaned #${index + 1}: sku="${reservation.sku}", quantity=${reservation.quantity}, age=${Math.round((now.getTime() - new Date(reservation.created_at).getTime()) / (1000 * 60 * 60))}h`)
    })

    // Delete orphaned reservations using direct database access
    const knex = container.resolve("db:connection")
    const orphanedIds = orphanedReservations.map((r: any) => r.id)
    
    const deletedCount = await knex('reservation')
      .whereIn('id', orphanedIds)
      .del()

    logger.info(`[AutoCleanup] Successfully deleted ${deletedCount} orphaned reservations`)
    logger.info(`[AutoCleanup] Cleanup complete! Healthy reservations remaining: ${allReservations.length - deletedCount}`)

  } catch (error) {
    logger.error("[AutoCleanup] Error during automated cleanup:", error)
    // Don't throw - we don't want to crash the scheduler
  }
}

// Job configuration - runs every 6 hours
export const config = {
  name: "cleanup-orphaned-reservations",
  schedule: "0 */6 * * *", // Every 6 hours at minute 0 (e.g., 00:00, 06:00, 12:00, 18:00)
  // Alternative schedules:
  // "0 2 * * *"      - Daily at 2 AM
  // "0 */12 * * *"   - Every 12 hours
  // "0 0 * * 0"      - Weekly on Sunday at midnight
}
