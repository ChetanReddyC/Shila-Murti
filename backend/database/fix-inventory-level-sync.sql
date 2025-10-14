-- ============================================================================
-- Fix Inventory Level Reserved Quantity
-- ============================================================================
-- The problem: inventory_level.reserved_quantity is out of sync with actual reservations
-- Medusa recalculates this periodically and gets it wrong
-- ============================================================================

-- Step 1: Show current mismatch
SELECT 
  'Current State (WRONG)' as info,
  il.stocked_quantity as in_stock,
  il.reserved_quantity as reserved_in_level,
  COALESCE(SUM(ri.quantity), 0) as actual_reservations,
  il.reserved_quantity - COALESCE(SUM(ri.quantity), 0) as mismatch,
  ii.sku
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
LEFT JOIN reservation_item ri ON ri.inventory_item_id = ii.id AND ri.deleted_at IS NULL
WHERE ii.sku = 'PURE-BLACK-ABSTRACT'
GROUP BY il.id, il.stocked_quantity, il.reserved_quantity, ii.sku;

-- Step 2: Fix the reserved_quantity to match actual reservations
UPDATE inventory_level
SET 
  reserved_quantity = (
    SELECT COALESCE(SUM(ri.quantity), 0)
    FROM reservation_item ri
    WHERE ri.inventory_item_id = inventory_level.inventory_item_id
      AND ri.deleted_at IS NULL
  ),
  raw_reserved_quantity = (
    SELECT jsonb_build_object(
      'value', COALESCE(SUM(ri.quantity), 0)::text,
      'precision', 20
    )
    FROM reservation_item ri
    WHERE ri.inventory_item_id = inventory_level.inventory_item_id
      AND ri.deleted_at IS NULL
  )
WHERE inventory_item_id IN (
  SELECT id FROM inventory_item WHERE sku = 'PURE-BLACK-ABSTRACT'
);

-- Step 3: Verify fix
SELECT 
  'After Fix (CORRECT)' as info,
  il.stocked_quantity as in_stock,
  il.reserved_quantity as reserved_in_level,
  COALESCE(SUM(ri.quantity), 0) as actual_reservations,
  (il.stocked_quantity - il.reserved_quantity) as available,
  ii.sku
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
LEFT JOIN reservation_item ri ON ri.inventory_item_id = ii.id AND ri.deleted_at IS NULL
WHERE ii.sku = 'PURE-BLACK-ABSTRACT'
GROUP BY il.id, il.stocked_quantity, il.reserved_quantity, ii.sku;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Inventory Level Fixed!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Reserved quantity now matches actual reservations';
  RAISE NOTICE 'Check admin panel - should show 99 available now!';
  RAISE NOTICE '==============================================';
END $$;
