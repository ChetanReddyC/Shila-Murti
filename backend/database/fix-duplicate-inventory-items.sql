-- ============================================================================
-- Fix Duplicate Inventory Items Issue
-- ============================================================================
-- Problem: Same variant has 2 inventory items with same SKU
-- One has stock (100 units), one has none
-- Medusa Admin shows "0 available" because it checks the wrong one
-- ============================================================================

-- Step 1: Show the duplicate inventory items
SELECT 
  'DUPLICATE INVENTORY ITEMS' as issue,
  ii.id,
  ii.sku,
  ii.title,
  pvi.variant_id,
  COALESCE(il.stocked_quantity, 0) as stock,
  COALESCE(il.reserved_quantity, 0) as reserved,
  CASE 
    WHEN il.id IS NULL THEN '❌ NO LOCATION'
    ELSE '✅ Has Location'
  END as has_stock_location
FROM inventory_item ii
JOIN product_variant_inventory_item pvi ON ii.id = pvi.inventory_item_id
LEFT JOIN inventory_level il ON ii.id = il.inventory_item_id AND il.deleted_at IS NULL
WHERE ii.sku = 'PURE-BLACK-ABSTRACT'
ORDER BY ii.created_at;

-- Step 2: Identify which one to keep and which to delete
SELECT 
  'DECISION' as action,
  ii.id,
  ii.title,
  CASE 
    WHEN il.stocked_quantity > 0 THEN '✅ KEEP (has stock)'
    WHEN il.id IS NULL THEN '❌ DELETE (no location/stock)'
    ELSE '⚠️ REVIEW'
  END as decision
FROM inventory_item ii
LEFT JOIN inventory_level il ON ii.id = il.inventory_item_id AND il.deleted_at IS NULL
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

-- Step 3: Delete the empty inventory item
-- This is the one with NO inventory_level
DELETE FROM product_variant_inventory_item
WHERE inventory_item_id = 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0';

DELETE FROM inventory_item
WHERE id = 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_level 
    WHERE inventory_item_id = 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0'
  );

-- Step 4: Verify fix
SELECT 
  'AFTER FIX' as status,
  ii.id,
  ii.sku,
  il.stocked_quantity as stock,
  il.reserved_quantity as reserved,
  (il.stocked_quantity - il.reserved_quantity) as available
FROM inventory_item ii
JOIN inventory_level il ON ii.id = il.inventory_item_id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

-- Step 5: Check variant now has only 1 inventory item
SELECT 
  'VARIANT CHECK' as info,
  pv.sku as variant_sku,
  COUNT(pvi.inventory_item_id) as inventory_item_count,
  CASE 
    WHEN COUNT(pvi.inventory_item_id) = 1 THEN '✅ CORRECT (1 item)'
    ELSE '❌ STILL WRONG'
  END as status
FROM product_variant pv
LEFT JOIN product_variant_inventory_item pvi ON pv.id = pvi.variant_id
WHERE pv.sku = 'PURE-BLACK-ABSTRACT'
GROUP BY pv.id, pv.sku;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Duplicate Inventory Item Removed!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Variant now has only 1 inventory item';
  RAISE NOTICE 'Admin panel should show correct availability now';
  RAISE NOTICE '==============================================';
END $$;
