-- ============================================================================
-- Fix: Product Variant with "facility" Inventory Items
-- ============================================================================
-- This variant has NO SKU but its inventory items have "facility" as SKU
-- We need to either:
-- A) Assign proper SKU to the variant
-- B) Delete the variant if it's garbage
-- ============================================================================

-- Check the variant details
SELECT 
  'Current State' as info,
  pv.id as variant_id,
  pv.title as variant_title,
  pv.sku as variant_sku,
  p.id as product_id,
  p.title as product_title,
  p.status as product_status
FROM product_variant pv
JOIN product p ON pv.product_id = p.id
WHERE pv.id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Check inventory items linked to this variant
SELECT 
  'Inventory Items' as info,
  ii.id,
  ii.sku,
  ii.title
FROM inventory_item ii
JOIN product_variant_inventory_item pvi ON ii.id = pvi.inventory_item_id
WHERE pvi.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Check if there are orders for this variant
SELECT 
  'Orders' as info,
  COUNT(DISTINCT li.order_id) as order_count,
  SUM(li.quantity) as total_quantity_sold,
  MAX(li.created_at) as last_order_date
FROM line_item li
WHERE li.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- ============================================================================
-- SOLUTION A: Assign Proper SKU (if this is a real product)
-- ============================================================================

/*
-- Update variant SKU
UPDATE product_variant 
SET sku = 'PURE-BLACK-ABSTRACT-001'  -- Change this to your actual SKU format
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Update inventory item SKUs to match
UPDATE inventory_item
SET sku = 'PURE-BLACK-ABSTRACT-001'  -- Same SKU as variant
WHERE id IN (
  SELECT pvi.inventory_item_id
  FROM product_variant_inventory_item pvi
  WHERE pvi.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
);
*/

-- ============================================================================
-- SOLUTION B: Delete Everything (if this is garbage data)
-- ============================================================================

/*
-- Delete reservations
DELETE FROM reservation_item
WHERE inventory_item_id IN (
  SELECT pvi.inventory_item_id
  FROM product_variant_inventory_item pvi
  WHERE pvi.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
);

-- Delete inventory levels
DELETE FROM inventory_level
WHERE inventory_item_id IN (
  SELECT pvi.inventory_item_id
  FROM product_variant_inventory_item pvi
  WHERE pvi.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
);

-- Unlink inventory items from variant
DELETE FROM product_variant_inventory_item
WHERE variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Delete inventory items
DELETE FROM inventory_item
WHERE sku = 'facility';

-- Delete the variant (this will cascade to related tables)
DELETE FROM product_variant
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- Delete the product if it has no other variants
DELETE FROM product
WHERE id = (
  SELECT product_id FROM product_variant 
  WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
)
AND NOT EXISTS (
  SELECT 1 FROM product_variant 
  WHERE product_id = product.id
);
*/

-- ============================================================================
-- Verification
-- ============================================================================

/*
-- Check if "facility" SKU still exists
SELECT COUNT(*) as remaining_facility_items
FROM inventory_item
WHERE sku = 'facility';

-- Check if variant still exists
SELECT COUNT(*) as variant_exists
FROM product_variant
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';
*/

-- Instructions
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '⚠️  DECISION REQUIRED:';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Review the data above and choose:';
  RAISE NOTICE '';
  RAISE NOTICE 'SOLUTION A: If "Pure Black Abstract" is a REAL product:';
  RAISE NOTICE '  - Uncomment SOLUTION A';
  RAISE NOTICE '  - Change SKU to proper format (e.g., PURE-BLACK-ABSTRACT-001)';
  RAISE NOTICE '  - Run this script again';
  RAISE NOTICE '';
  RAISE NOTICE 'SOLUTION B: If this is GARBAGE data:';
  RAISE NOTICE '  - Uncomment SOLUTION B';
  RAISE NOTICE '  - Run this script again';
  RAISE NOTICE '  - This will DELETE the product, variant, and all related data';
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
END $$;
