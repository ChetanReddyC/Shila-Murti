# Debug Steps: Why Subscriber Isn't Working

## Test if Subscriber is Loaded

1. **Check Backend Startup Logs:**
```bash
cd backend
npm run dev 2>&1 | findstr /i "subscriber reservation guard"
```

Look for:
- `✓ Loading subscribers...`
- `inventory-reservation-guard`

2. **Add Debug Logging:**

Edit `src/subscribers/inventory-reservation-guard.ts`:

```typescript
export default async function inventoryReservationGuardSubscriber({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  
  // ADD THIS DEBUG LOG
  logger.warn("🔥🔥🔥 [ReservationGuard] SUBSCRIBER TRIGGERED! Event data:", event)
  
  try {
    const { data } = event
    
    // Validate reservation data
    const isValid = validateReservation(data)
    
    if (!isValid) {
      logger.error("❌❌❌ [ReservationGuard] BLOCKING INVALID RESERVATION:", {
        sku: data?.sku,
        inventory_item_id: data?.inventory_item_id,
        line_item_id: data?.line_item_id,
        quantity: data?.quantity,
      })
      
      // Prevent the reservation by throwing an error
      throw new Error("Invalid reservation blocked by guard")
    }
    
    logger.info("✅ [ReservationGuard] Valid reservation allowed:", {
      sku: data?.sku,
      quantity: data?.quantity,
    })
    
  } catch (error) {
    logger.error("❌ [ReservationGuard] Error:", error)
    throw error
  }
}
```

3. **Test Subscription Event Name:**

The issue might be the **event name is wrong**. Medusa might use different event names.

Try these variations:

```typescript
// Current
event: "reservation.created"

// Try these instead:
event: "inventory.reservation_item.created"
event: "inventory-reservation-item.created"  
event: "InventoryReservationItem.created"
event: "inventory_reservation_item.created"
```

## Quick Test

Create a test subscriber to see what events are firing:

**File: `src/subscribers/event-logger.ts`**

```typescript
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function eventLoggerSubscriber({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  
  // Log ALL events to see what's being fired
  logger.warn(`🔔 [EventLogger] Event fired: ${event.name}`, {
    eventName: event.name,
    hasData: !!event.data,
  })
}

export const config: SubscriberConfig = {
  event: "*", // Listen to ALL events
  context: {
    subscriberId: "event-logger",
  },
}
```

Then:
1. Restart backend
2. Place an order
3. Check logs for what events are actually fired
4. Look for any "reservation" related events

## Check if Medusa Even Fires Events

Medusa might not fire events for ALL reservation creations.

**Alternative: Use Database Trigger Instead**

Since subscriber might not work, use PostgreSQL trigger:

```sql
-- Connect to database
-- Run this SQL:

CREATE OR REPLACE FUNCTION block_phantom_reservations()
RETURNS TRIGGER AS $$
BEGIN
  -- Block if no line_item_id AND invalid SKU
  IF NEW.line_item_id IS NULL AND 
     (NEW.sku IS NULL OR NEW.sku IN ('facility', 'test', 'placeholder') OR NEW.inventory_item_id IS NULL) THEN
    
    RAISE EXCEPTION 'Blocked phantom reservation: sku=%, line_item_id=%, inventory_item_id=%', 
      NEW.sku, NEW.line_item_id, NEW.inventory_item_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS prevent_phantom_reservations ON reservation;

-- Create trigger
CREATE TRIGGER prevent_phantom_reservations
  BEFORE INSERT ON reservation
  FOR EACH ROW
  EXECUTE FUNCTION block_phantom_reservations();
```

This will **definitely** block phantom reservations at the database level.
