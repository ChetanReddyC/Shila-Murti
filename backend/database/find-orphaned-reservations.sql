-- ============================================================================
-- Find Orphaned Reservations (not attached to any order)
-- ============================================================================

-- Check if reservation's line_item is actually in an order
SELECT 
  'Reservation Status' as info,
  ri.id as reservation_id,
  ri.line_item_id,
  ri.quantity as reserved_qty,
  CASE 
    WHEN oi.order_id IS NULL THEN '❌ ORPHANED (no order)'
    ELSE '✅ Has Order'
  END as status,
  oi.order_id,
  o.display_id as order_number,
  o.status as order_status
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id AND oi.deleted_at IS NULL
LEFT JOIN "order" o ON oi.order_id = o.id
WHERE ri.deleted_at IS NULL
ORDER BY ri.created_at DESC;

-- Count orphaned vs valid reservations
SELECT 
  CASE 
    WHEN oi.order_id IS NULL THEN '❌ Orphaned Reservation'
    ELSE '✅ Valid Reservation'
  END as reservation_type,
  COUNT(*) as count,
  SUM(ri.quantity) as total_quantity_reserved
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id AND oi.deleted_at IS NULL
WHERE ri.deleted_at IS NULL
GROUP BY (oi.order_id IS NULL);

-- Show orphaned reservations detail
SELECT 
  'Orphaned Reservations' as type,
  ri.id as reservation_id,
  ri.line_item_id,
  ri.quantity,
  ri.location_id,
  ii.sku,
  ii.title as inventory_title,
  ri.created_at
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id AND oi.deleted_at IS NULL
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ri.deleted_at IS NULL
  AND oi.order_id IS NULL
ORDER BY ri.created_at DESC;

-- Summary
DO $$
DECLARE
  orphaned_count INTEGER;
  orphaned_qty NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(ri.quantity), 0)
  INTO orphaned_count, orphaned_qty
  FROM reservation_item ri
  LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id AND oi.deleted_at IS NULL
  WHERE ri.deleted_at IS NULL
    AND oi.order_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Orphaned Reservations Summary:';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Total orphaned reservations: %', orphaned_count;
  RAISE NOTICE 'Total quantity blocked: %', orphaned_qty;
  RAISE NOTICE '';
  
  IF orphaned_count > 0 THEN
    RAISE NOTICE '❌ ACTION REQUIRED: Delete these orphaned reservations!';
    RAISE NOTICE '✅ Run: database/delete-orphaned-reservations.sql';
  ELSE
    RAISE NOTICE '✅ No orphaned reservations found!';
  END IF;
  
  RAISE NOTICE '==============================================';
END $$;
