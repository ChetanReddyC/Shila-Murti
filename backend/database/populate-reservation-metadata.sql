-- ============================================================================
-- Populate Missing Reservation Fields (Order ID & Description)
-- ============================================================================

-- Step 1: Show current state (missing fields)
SELECT 
  'BEFORE FIX' as status,
  ri.id,
  ri.description,
  ri.external_id,
  ri.metadata,
  o.display_id as should_be_order_id,
  oli.title as should_be_description
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id
LEFT JOIN "order" o ON oi.order_id = o.id
LEFT JOIN order_line_item oli ON oi.item_id = oli.id
WHERE ri.deleted_at IS NULL;

-- Step 2: Update reservations with Order ID and Description
UPDATE reservation_item ri
SET 
  description = oli.title,
  external_id = o.display_id::text,
  metadata = jsonb_build_object(
    'order_id', o.id,
    'order_display_id', o.display_id,
    'product_title', oli.title,
    'variant_sku', oli.variant_sku
  )
FROM order_item oi
JOIN "order" o ON oi.order_id = o.id
JOIN order_line_item oli ON oi.item_id = oli.id
WHERE ri.line_item_id = oi.item_id
  AND ri.deleted_at IS NULL
  AND (ri.description IS NULL OR ri.external_id IS NULL);

-- Step 3: Show after fix
SELECT 
  'AFTER FIX' as status,
  ri.id,
  ri.description,
  ri.external_id as order_display_id,
  ri.metadata,
  o.display_id as actual_order_id
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id
LEFT JOIN "order" o ON oi.order_id = o.id
WHERE ri.deleted_at IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Reservation Metadata Populated!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Order ID and Description now visible in admin';
  RAISE NOTICE '==============================================';
END $$;
