# Root Cause: Reservation Quantity Bug

## The Problem

When an order is placed:
- Customer orders: **1 unit**
- Medusa reserves: **100 units** (entire stock!)
- Result: All inventory blocked

## What We Fixed

```sql
✅ Changed reservation quantity from 100 → 1
✅ Freed up 99 units for sale
✅ Order #13 still valid with correct reservation
```

## Root Cause Investigation

### Possible Causes:

1. **Cart item quantity wrong**
   - Check if cart had quantity=100 before checkout
   - Or did it have quantity=1?

2. **Order creation bug**
   - Medusa might be using stock quantity instead of order quantity
   - When creating reservation

3. **Product variant configuration**
   - Some field might be set to 100 (like min/max order qty)
   - Causing reservation to use that instead

4. **Custom code issue**
   - Your `customerAccountManager.ts` calls `updateCarts()`
   - Might be triggering incorrect reservation logic

## Investigation Steps

### Step 1: Check Cart History
```sql
-- Was the cart quantity correct?
SELECT cli.quantity, cli.variant_id, c.created_at
FROM cart_line_item cli
JOIN cart c ON cli.cart_id = c.id
WHERE cli.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
ORDER BY c.created_at DESC
LIMIT 10;
```

### Step 2: Check Product Variant Settings
```sql
-- Any weird quantity settings?
SELECT *
FROM product_variant
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';
```

### Step 3: Test New Order
1. Place a new order for 2 units
2. Check reservation created
3. Should reserve 2, not 100

If it reserves 100 again → Medusa bug
If it reserves 2 → Previous order was the issue

## Medusa Bug Theory

**Hypothesis:** Medusa's inventory reservation logic might be:

```typescript
// BUG: Using stock quantity instead of order quantity
const reservationQty = inventoryLevel.stocked_quantity; // ❌ WRONG!

// Should be:
const reservationQty = lineItem.quantity; // ✅ CORRECT
```

## Prevention

### Fix 1: Add Reservation Validation

Create a trigger to block quantity mismatches:

```sql
CREATE OR REPLACE FUNCTION validate_reservation_quantity()
RETURNS TRIGGER AS $$
DECLARE
  line_item_qty NUMERIC;
BEGIN
  -- Get the actual line item quantity
  SELECT oi.quantity INTO line_item_qty
  FROM order_item oi
  WHERE oi.item_id = NEW.line_item_id;
  
  -- If reservation quantity doesn't match, fix it
  IF line_item_qty IS NOT NULL AND NEW.quantity != line_item_qty THEN
    RAISE WARNING 'Reservation quantity mismatch! Ordered: %, Reserved: %', 
      line_item_qty, NEW.quantity;
    NEW.quantity := line_item_qty;
    NEW.raw_quantity := json_build_object('value', line_item_qty::text, 'precision', 20);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fix_reservation_quantity
  BEFORE INSERT ON reservation_item
  FOR EACH ROW
  EXECUTE FUNCTION validate_reservation_quantity();
```

### Fix 2: Monitor Reservations

Add logging to catch quantity mismatches:

```typescript
// In subscriber
subscriber.on('reservation.created', async ({ data }) => {
  const reservation = data;
  const lineItem = await getLineItem(reservation.line_item_id);
  
  if (reservation.quantity !== lineItem.quantity) {
    logger.error('Reservation quantity mismatch!', {
      reservation_id: reservation.id,
      reserved: reservation.quantity,
      ordered: lineItem.quantity
    });
    
    // Auto-fix
    await updateReservation(reservation.id, {
      quantity: lineItem.quantity
    });
  }
});
```

## Temporary Fix Applied ✅

For now, we manually fixed Order #13:
- Reservation quantity corrected
- Inventory available again
- System working

But we need to:
1. ✅ Test new orders
2. ✅ Add prevention trigger
3. ✅ Monitor for recurrence
4. ❌ Report to Medusa if it's a core bug

## Summary

**Status:** ✅ Immediate issue fixed  
**Available Stock:** 99 units  
**Reserved:** 1 unit (Order #13)  
**Action Needed:** Test new order placement  
**Prevention:** Add validation trigger  
**Root Cause:** TBD - needs more testing  
