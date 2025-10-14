-- ============================================================================
-- Investigation: "Facility" SKU Reservations
-- ============================================================================

-- 1. Check inventory items with "facility" SKU
SELECT 
  'Inventory Item' as type,
  id,
  sku,
  title,
  created_at
FROM inventory_item
WHERE sku = 'facility'
ORDER BY created_at;

-- 2. Check if these inventory items are linked to any products
SELECT 
  ii.id as inventory_item_id,
  ii.sku,
  ii.title as inventory_title,
  pvi.variant_id,
  pv.sku as variant_sku,
  pv.title as variant_title
FROM inventory_item ii
LEFT JOIN product_variant_inventory_item pvi ON ii.id = pvi.inventory_item_id
LEFT JOIN product_variant pv ON pvi.variant_id = pv.id
WHERE ii.sku = 'facility';

-- 3. Count reservations for "facility" inventory items
SELECT 
  ii.sku,
  ii.title,
  COUNT(ri.id) as reservation_count,
  SUM(ri.quantity) as total_quantity,
  COUNT(DISTINCT ri.line_item_id) as unique_line_items
FROM inventory_item ii
LEFT JOIN reservation_item ri ON ii.id = ri.inventory_item_id AND ri.deleted_at IS NULL
WHERE ii.sku = 'facility'
GROUP BY ii.id, ii.sku, ii.title;

-- 4. Check if line items exist for these reservations
SELECT 
  ri.id as reservation_id,
  ri.line_item_id,
  ri.quantity,
  ri.created_at,
  ii.sku
FROM reservation_item ri
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ii.sku = 'facility'
  AND ri.deleted_at IS NULL
ORDER BY ri.created_at DESC;

-- 5. Check inventory levels for "facility" items
SELECT 
  il.inventory_item_id,
  ii.sku,
  ii.title,
  il.location_id,
  il.stocked_quantity,
  il.reserved_quantity,
  il.incoming_quantity
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku = 'facility';

-- 6. Summary: Are these orphaned inventory items?
SELECT 
  CASE 
    WHEN pvi.variant_id IS NULL THEN '❌ ORPHANED (not linked to any product)'
    ELSE '✅ Linked to product'
  END as status,
  ii.id,
  ii.sku,
  ii.title,
  pvi.variant_id
FROM inventory_item ii
LEFT JOIN product_variant_inventory_item pvi ON ii.id = pvi.inventory_item_id
WHERE ii.sku = 'facility';

-- Conclusion message
DO $$
DECLARE
  facility_count INTEGER;
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO facility_count 
  FROM inventory_item 
  WHERE sku = 'facility';
  
  SELECT COUNT(*) INTO orphaned_count
  FROM inventory_item ii
  LEFT JOIN product_variant_inventory_item pvi ON ii.id = pvi.inventory_item_id
  WHERE ii.sku = 'facility' AND pvi.variant_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Investigation Summary:';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Total "facility" inventory items: %', facility_count;
  RAISE NOTICE 'Orphaned (not linked to products): %', orphaned_count;
  RAISE NOTICE '';
  
  IF orphaned_count > 0 THEN
    RAISE NOTICE '✅ ACTION: These are GARBAGE data - safe to delete';
    RAISE NOTICE '✅ Run cleanup-facility-garbage.sql to remove them';
  ELSE
    RAISE NOTICE '⚠️ WARNING: These are linked to real products!';
    RAISE NOTICE '⚠️ Need to fix the product SKUs first';
  END IF;
  
  RAISE NOTICE '==============================================';
END $$;
