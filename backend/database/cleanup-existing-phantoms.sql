-- ============================================================================
-- Clean Up Existing Phantom Reservations
-- ============================================================================
-- Run this AFTER creating the trigger to clean up old phantom reservations
-- ============================================================================

-- Step 1: Show what will be deleted
SELECT 
  id,
  sku,
  line_item_id,
  inventory_item_id,
  quantity,
  location_id,
  created_at
FROM reservation_item 
WHERE line_item_id IS NULL 
  AND (
    sku IS NULL OR 
    sku = '' OR
    sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock') OR 
    inventory_item_id IS NULL
  )
ORDER BY created_at DESC;

-- Step 2: Count how many will be deleted
SELECT 
  COUNT(*) as phantom_reservations_to_delete
FROM reservation_item 
WHERE line_item_id IS NULL 
  AND (
    sku IS NULL OR 
    sku = '' OR
    sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock') OR 
    inventory_item_id IS NULL
  );

-- Step 3: Delete phantom reservations
-- UNCOMMENT THE LINES BELOW TO ACTUALLY DELETE
/*
DELETE FROM reservation_item 
WHERE line_item_id IS NULL 
  AND (
    sku IS NULL OR 
    sku = '' OR
    sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock') OR 
    inventory_item_id IS NULL
  );
*/

-- Step 4: Verify deletion
-- UNCOMMENT AFTER RUNNING DELETE
/*
SELECT 
  COUNT(*) as remaining_phantom_reservations
FROM reservation_item 
WHERE line_item_id IS NULL 
  AND (
    sku IS NULL OR 
    sku = '' OR
    sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock') OR 
    inventory_item_id IS NULL
  );
*/

-- Instructions:
-- 1. First run as-is to see what will be deleted
-- 2. Review the results carefully
-- 3. Uncomment the DELETE section and run again
-- 4. Uncomment the verification and confirm cleanup succeeded
