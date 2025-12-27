/**
 * Debug Event Logger
 * 
 * Logs ALL events fired by Medusa to help identify the correct event name
 * Use this temporarily to see what events are being triggered
 */

import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function debugAllEventsSubscriber({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const eventName = (event as any).name || (event as any).eventName || "unknown"

  // Only log inventory/reservation related events to reduce noise
  if (eventName.toLowerCase().includes('reservation') ||
    eventName.toLowerCase().includes('inventory') ||
    eventName.toLowerCase().includes('cart')) {
    logger.warn(`🔔🔔🔔 [DEBUG] Event: ${eventName} ${JSON.stringify({
      fullEvent: event,
      dataKeys: event.data ? Object.keys(event.data) : [],
    })}`)
  }
}

export const config: SubscriberConfig = {
  event: "*", // Listen to ALL events
  context: {
    subscriberId: "debug-all-events",
  },
}
