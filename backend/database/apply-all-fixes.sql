-- ============================================
-- COMPLETE FIX FOR PHANTOM RESERVATION ISSUE
-- ============================================

-- First, fix the current out-of-sync inventory_level
UPDATE inventory_level
SET reserved_quantity = (
    SELECT COALESCE(SUM(ri.quantity), 0)
    FROM reservation_item ri
    WHERE ri.inventory_item_id = inventory_level.inventory_item_id
    AND ri.location_id = inventory_level.location_id
)
WHERE inventory_item_id = 'iitem_01K7E93C5X154Y3PGC5X80PF7P';

-- Verify the fix
SELECT 
    ii.sku,
    il.stocked_quantity,
    il.reserved_quantity,
    (il.stocked_quantity - il.reserved_quantity) as available,
    (SELECT COUNT(*) FROM reservation_item WHERE inventory_item_id = ii.id) as reservation_count,
    (SELECT COALESCE(SUM(quantity), 0) FROM reservation_item WHERE inventory_item_id = ii.id) as actual_reserved_sum
FROM inventory_item ii
JOIN inventory_level il ON ii.id = il.inventory_item_id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

-- ============================================
-- Create trigger to auto-sync reserved_quantity
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_inventory_level_on_reservation_change ON reservation_item;
DROP FUNCTION IF EXISTS sync_inventory_level_reserved_quantity();

-- Create function that syncs inventory_level.reserved_quantity
CREATE OR REPLACE FUNCTION sync_inventory_level_reserved_quantity()
RETURNS TRIGGER AS $$
DECLARE
    affected_inventory_id TEXT;
    affected_location_id TEXT;
BEGIN
    -- Determine which inventory item and location were affected
    IF (TG_OP = 'DELETE') THEN
        affected_inventory_id := OLD.inventory_item_id;
        affected_location_id := OLD.location_id;
    ELSE
        affected_inventory_id := NEW.inventory_item_id;
        affected_location_id := NEW.location_id;
    END IF;

    -- Update the inventory_level.reserved_quantity to match the sum of all reservations
    UPDATE inventory_level
    SET 
        reserved_quantity = (
            SELECT COALESCE(SUM(quantity), 0)
            FROM reservation_item
            WHERE inventory_item_id = affected_inventory_id
            AND location_id = affected_location_id
        ),
        updated_at = NOW()
    WHERE inventory_item_id = affected_inventory_id
    AND location_id = affected_location_id;

    -- Log the sync (optional - comment out if too verbose)
    RAISE NOTICE 'Synced inventory_level for item % at location %', affected_inventory_id, affected_location_id;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER any reservation change
CREATE TRIGGER sync_inventory_level_on_reservation_change
AFTER INSERT OR UPDATE OR DELETE ON reservation_item
FOR EACH ROW
EXECUTE FUNCTION sync_inventory_level_reserved_quantity();

-- ============================================
-- Test the trigger
-- ============================================
SELECT 'Trigger created successfully!' as status;

-- Verify current state after fix
SELECT 
    'PURE-BLACK-ABSTRACT' as product,
    il.stocked_quantity as stocked,
    il.reserved_quantity as reserved,
    (il.stocked_quantity - il.reserved_quantity) as available,
    (SELECT COUNT(*) FROM reservation_item ri WHERE ri.inventory_item_id = il.inventory_item_id) as reservation_count
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';
