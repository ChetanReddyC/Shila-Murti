/**
 * Inventory Reservation Guard Subscriber
 * 
 * Prevents phantom/invalid reservations from being created
 * Automatically validates and blocks bad reservation attempts
 */

import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function inventoryReservationGuardSubscriber({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const { data } = event

    // Validate reservation data
    const isValid = validateReservation(data)

    if (!isValid) {
      logger.warn(`[ReservationGuard] Blocked invalid reservation attempt: ${JSON.stringify({
        sku: data?.sku,
        inventory_item_id: data?.inventory_item_id,
        line_item_id: data?.line_item_id,
        quantity: data?.quantity,
      })}`)

      // Prevent the reservation by throwing an error
      // Medusa will rollback the transaction
      throw new Error("Invalid reservation: missing required fields (line_item_id or inventory_item_id)")
    }

    logger.info(`[ReservationGuard] Valid reservation created: ${JSON.stringify({
      sku: data?.sku,
      quantity: data?.quantity,
    })}`)

  } catch (error) {
    logger.error("[ReservationGuard] Error in reservation guard:", error)
    // Re-throw to prevent invalid reservation
    throw error
  }
}

function validateReservation(data: any): boolean {
  // A valid reservation must have:
  // 1. Either a line_item_id (for order reservations)
  // 2. OR a valid inventory_item_id (for manual reservations)
  // 3. AND a valid SKU (not "facility", "test", or empty)

  const hasLineItem = data?.line_item_id && data.line_item_id.trim() !== ""
  const hasInventoryItem = data?.inventory_item_id && data.inventory_item_id.trim() !== ""
  const hasValidSku = data?.sku &&
    data.sku.trim() !== "" &&
    !["facility", "test", "placeholder"].includes(data.sku.toLowerCase())

  // Valid if has line_item OR (has inventory_item AND valid SKU)
  return hasLineItem || (hasInventoryItem && hasValidSku)
}

export const config: SubscriberConfig = {
  event: "reservation.created",
  context: {
    subscriberId: "inventory-reservation-guard",
  },
}
