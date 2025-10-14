-- ============================================================================
-- Cleanup: Delete "Facility" Garbage Data
-- ============================================================================
-- WARNING: This will DELETE data! Review carefully before uncommenting!
-- ============================================================================

-- Step 1: Show what will be deleted
RAISE NOTICE 'Step 1: Checking what will be deleted...';

SELECT 
  'Reservation to delete' as type,
  ri.id,
  ri.quantity,
  ri.created_at,
  ii.sku
FROM reservation_item ri
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder')
  AND ri.deleted_at IS NULL;

SELECT 
  'Inventory Level to delete' as type,
  il.inventory_item_id,
  il.location_id,
  il.stocked_quantity,
  il.reserved_quantity,
  ii.sku
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder');

SELECT 
  'Inventory Item to delete' as type,
  id,
  sku,
  title,
  created_at
FROM inventory_item
WHERE sku IN ('facility', 'test', 'placeholder');

-- Step 2: Count what will be deleted
SELECT 
  COUNT(*) as reservations_to_delete
FROM reservation_item ri
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder')
  AND ri.deleted_at IS NULL;

SELECT 
  COUNT(*) as inventory_levels_to_delete
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder');

SELECT 
  COUNT(*) as inventory_items_to_delete
FROM inventory_item
WHERE sku IN ('facility', 'test', 'placeholder');

-- Step 3: DELETE (UNCOMMENT to execute)
-- ============================================================================
-- WARNING: DESTRUCTIVE OPERATION - REVIEW ABOVE RESULTS FIRST!
-- ============================================================================

/*
-- Delete reservations first
DELETE FROM reservation_item 
WHERE inventory_item_id IN (
  SELECT id FROM inventory_item 
  WHERE sku IN ('facility', 'test', 'placeholder')
);

-- Delete inventory levels
DELETE FROM inventory_level
WHERE inventory_item_id IN (
  SELECT id FROM inventory_item 
  WHERE sku IN ('facility', 'test', 'placeholder')
);

-- Delete product-inventory links (if any)
DELETE FROM product_variant_inventory_item
WHERE inventory_item_id IN (
  SELECT id FROM inventory_item 
  WHERE sku IN ('facility', 'test', 'placeholder')
);

-- Finally, delete the inventory items themselves
DELETE FROM inventory_item
WHERE sku IN ('facility', 'test', 'placeholder');
*/

-- Step 4: Verify deletion (UNCOMMENT after running delete)
/*
SELECT 
  COUNT(*) as remaining_facility_items
FROM inventory_item
WHERE sku IN ('facility', 'test', 'placeholder');

SELECT 
  COUNT(*) as remaining_facility_reservations
FROM reservation_item ri
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder')
  AND ri.deleted_at IS NULL;
*/

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '⚠️  INSTRUCTIONS:';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '1. Review the data shown above';
  RAISE NOTICE '2. If it looks like garbage data, uncomment the DELETE section';
  RAISE NOTICE '3. Run this script again to actually delete';
  RAISE NOTICE '4. Uncomment the verification section and run again';
  RAISE NOTICE '5. Check admin panel - "facility" should be gone!';
  RAISE NOTICE '==============================================';
END $$;
