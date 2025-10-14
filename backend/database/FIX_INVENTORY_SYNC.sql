-- ============================================
-- COMPLETE FIX FOR INVENTORY SYNC ISSUE
-- ============================================
-- Run this file with: psql -U postgres -d medusa-store -f FIX_INVENTORY_SYNC.sql
--
-- PROBLEM:
--   - Reservations have correct quantity (1)
--   - But inventory_level.reserved_quantity shows wrong value (100)
--   - This causes "out of stock" errors even when inventory exists
--
-- SOLUTION:
--   1. Sync inventory_level.reserved_quantity with actual reservation totals
--   2. Create trigger to auto-sync on future changes
-- ============================================

\echo ''
\echo '============================================'
\echo 'STEP 1: Checking current state'
\echo '============================================'

SELECT 
    ii.sku,
    il.stocked_quantity as stocked,
    il.reserved_quantity as reserved_in_inventory_level,
    (SELECT COALESCE(SUM(quantity), 0) FROM reservation_item WHERE inventory_item_id = ii.id) as reserved_in_reservations,
    (il.stocked_quantity - il.reserved_quantity) as available_before_fix
FROM inventory_item ii
JOIN inventory_level il ON ii.id = il.inventory_item_id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

\echo ''
\echo '============================================'
\echo 'STEP 2: Fixing inventory_level.reserved_quantity'
\echo '============================================'

-- Update reserved_quantity to match actual reservation totals
UPDATE inventory_level
SET reserved_quantity = (
    SELECT COALESCE(SUM(ri.quantity), 0)
    FROM reservation_item ri
    WHERE ri.inventory_item_id = inventory_level.inventory_item_id
    AND ri.location_id = inventory_level.location_id
    AND ri.deleted_at IS NULL
),
updated_at = NOW();

\echo 'Reserved quantities synced for all inventory items!'

\echo ''
\echo '============================================'
\echo 'STEP 3: Verifying fix'
\echo '============================================'

SELECT 
    ii.sku,
    il.stocked_quantity as stocked,
    il.reserved_quantity as reserved_in_inventory_level,
    (SELECT COALESCE(SUM(quantity), 0) FROM reservation_item WHERE inventory_item_id = ii.id AND deleted_at IS NULL) as reserved_in_reservations,
    (il.stocked_quantity - il.reserved_quantity) as available_after_fix,
    CASE 
        WHEN il.reserved_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM reservation_item WHERE inventory_item_id = ii.id AND deleted_at IS NULL)
        THEN '✅ IN SYNC'
        ELSE '❌ STILL OUT OF SYNC'
    END as sync_status
FROM inventory_item ii
JOIN inventory_level il ON ii.id = il.inventory_item_id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

\echo ''
\echo '============================================'
\echo 'STEP 4: Creating auto-sync trigger'
\echo '============================================'

-- Drop existing trigger/function if exists
DROP TRIGGER IF EXISTS sync_inventory_level_on_reservation_change ON reservation_item;
DROP FUNCTION IF EXISTS sync_inventory_level_reserved_quantity();

-- Create function to sync reserved_quantity
CREATE OR REPLACE FUNCTION sync_inventory_level_reserved_quantity()
RETURNS TRIGGER AS $$
DECLARE
    affected_inventory_id TEXT;
    affected_location_id TEXT;
    new_reserved_total NUMERIC;
BEGIN
    -- Determine which inventory item and location were affected
    IF (TG_OP = 'DELETE') THEN
        affected_inventory_id := OLD.inventory_item_id;
        affected_location_id := OLD.location_id;
    ELSE
        affected_inventory_id := NEW.inventory_item_id;
        affected_location_id := NEW.location_id;
    END IF;

    -- Calculate total reserved for this inventory item at this location
    SELECT COALESCE(SUM(quantity), 0) INTO new_reserved_total
    FROM reservation_item
    WHERE inventory_item_id = affected_inventory_id
    AND location_id = affected_location_id
    AND deleted_at IS NULL;

    -- Update inventory_level.reserved_quantity
    UPDATE inventory_level
    SET 
        reserved_quantity = new_reserved_total,
        updated_at = NOW()
    WHERE inventory_item_id = affected_inventory_id
    AND location_id = affected_location_id;

    RAISE NOTICE 'Auto-synced inventory_level: item=%, location=%, reserved=%', 
        affected_inventory_id, affected_location_id, new_reserved_total;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER any change to reservation_item
CREATE TRIGGER sync_inventory_level_on_reservation_change
AFTER INSERT OR UPDATE OR DELETE ON reservation_item
FOR EACH ROW
EXECUTE FUNCTION sync_inventory_level_reserved_quantity();

\echo 'Auto-sync trigger created!'

\echo ''
\echo '============================================'
\echo 'STEP 5: Verifying trigger'
\echo '============================================'

SELECT 
    tgname as trigger_name,
    CASE tgenabled 
        WHEN 'O' THEN '✅ Enabled'
        ELSE '❌ Disabled'
    END as status,
    'AFTER ' || 
    CASE 
        WHEN tgtype & 4 = 4 THEN 'INSERT '
        ELSE ''
    END ||
    CASE 
        WHEN tgtype & 8 = 8 THEN 'DELETE '
        ELSE ''
    END ||
    CASE 
        WHEN tgtype & 16 = 16 THEN 'UPDATE '
        ELSE ''
    END as fires_on
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass
AND tgname = 'sync_inventory_level_on_reservation_change';

\echo ''
\echo '============================================'
\echo '✅ COMPLETE FIX APPLIED!'
\echo '============================================'
\echo ''
\echo 'What was fixed:'
\echo '  1. Synced inventory_level.reserved_quantity with actual reservations'
\echo '  2. Created trigger to auto-sync on future changes'
\echo ''
\echo 'Now when orders are placed:'
\echo '  - Reservations will be created correctly'
\echo '  - inventory_level will auto-update via trigger'
\echo '  - Product will show correct availability'
\echo ''
\echo 'Test by placing an order - availability should update correctly!'
\echo '============================================'
\echo ''
