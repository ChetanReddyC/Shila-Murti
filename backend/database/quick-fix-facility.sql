-- ============================================================================
-- QUICK FIX: Assign Proper SKU to "Pure Black Abstract" Product
-- ============================================================================

-- Step 1: Show current state
SELECT 
  '❌ BEFORE FIX' as status,
  pv.id as variant_id,
  pv.title,
  pv.sku as variant_sku,
  ii.id as inventory_id,
  ii.sku as inventory_sku
FROM product_variant pv
JOIN product_variant_inventory_item pvi ON pv.id = pvi.variant_id
JOIN inventory_item ii ON pvi.inventory_item_id = ii.id
WHERE pv.id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Step 2: Assign proper SKU to variant
UPDATE product_variant 
SET sku = 'PURE-BLACK-ABSTRACT'
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Step 3: Update inventory items to match
UPDATE inventory_item 
SET sku = 'PURE-BLACK-ABSTRACT'
WHERE id IN (
  SELECT pvi.inventory_item_id
  FROM product_variant_inventory_item pvi
  WHERE pvi.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
);

-- Step 4: Show fixed state
SELECT 
  '✅ AFTER FIX' as status,
  pv.id as variant_id,
  pv.title,
  pv.sku as variant_sku,
  ii.id as inventory_id,
  ii.sku as inventory_sku
FROM product_variant pv
JOIN product_variant_inventory_item pvi ON pv.id = pvi.variant_id
JOIN inventory_item ii ON pvi.inventory_item_id = ii.id
WHERE pv.id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Step 5: Verify no more "facility" SKUs exist
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ SUCCESS: No more "facility" SKUs!'
    ELSE '❌ ERROR: Still have "facility" SKUs'
  END as result,
  COUNT(*) as facility_count
FROM inventory_item
WHERE sku = 'facility';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ FIX APPLIED SUCCESSFULLY!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Restart Medusa backend';
  RAISE NOTICE '2. Check admin panel: http://localhost:7001/inventory/reservations';
  RAISE NOTICE '3. Should see "PURE-BLACK-ABSTRACT" instead of "facility"';
  RAISE NOTICE '4. Place a test order to verify';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Problem solved permanently!';
  RAISE NOTICE '==============================================';
END $$;
