# PERMANENT SOLUTION: Fix "Facility" SKU Issue

## Root Cause Found ✅

The problem is NOT phantom reservations without line_item_id.

**The REAL Issue:**
- There are **inventory_items in your database with SKU "facility"**
- These are being **sold as products** (they have orders and line items!)
- Orders are creating VALID reservations for these invalid inventory items

## Evidence

```sql
-- Found 2 inventory items with SKU "facility"
iitem_01K7E93C5X154Y3PGC5X80PF7P | facility | Main Facility
iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0 | facility | Default variant

-- Reservations ARE valid (have line_item_id)
resitem_01K7HGB9YV6S5P0R2801YVXD9Z | ordli_01K7HGB9P1RH8XT08Y3D2K3Y8H | facility | qty=100
```

## The Real Problem

1. **Product/Variant with "facility" SKU exists in catalog**
2. **Users are BUYING this product**
3. **Orders create valid reservations**
4. **You see "facility" in admin panel**

## Permanent Fix

### Step 1: Find the Culprit Product/Variant

```sql
-- Find which product has "facility" SKU
SELECT 
  pv.id as variant_id,
  pv.title as variant_title,
  pv.sku,
  p.id as product_id,
  p.title as product_title,
  p.status
FROM product_variant pv
JOIN product p ON pv.product_id = p.id
WHERE pv.sku IN ('facility', 'test', 'placeholder');
```

### Step 2: Check if Product is Still Active

```sql
-- See if it's being sold
SELECT 
  COUNT(*) as total_orders,
  SUM(li.quantity) as total_quantity,
  MAX(o.created_at) as last_order
FROM line_item li
JOIN "order" o ON li.order_id = o.id
JOIN product_variant pv ON li.variant_id = pv.id
WHERE pv.sku = 'facility';
```

### Step 3: Delete/Fix the Product

**Option A: Delete the product entirely** (if it's garbage)

```sql
-- Delete product variant with "facility" SKU
DELETE FROM product_variant WHERE sku = 'facility';

-- Clean up orphaned inventory items
DELETE FROM inventory_item WHERE sku = 'facility';
```

**Option B: Fix the SKU** (if it's a real product)

```sql
-- Update to proper SKU
UPDATE product_variant 
SET sku = 'PROPER-SKU-HERE' 
WHERE sku = 'facility';

UPDATE inventory_item 
SET sku = 'PROPER-SKU-HERE' 
WHERE sku = 'facility';
```

### Step 4: Clean Up Existing Reservations

```sql
-- Delete all "facility" reservations
DELETE FROM reservation_item 
WHERE inventory_item_id IN (
  SELECT id FROM inventory_item WHERE sku = 'facility'
);
```

### Step 5: Prevent Future "facility" Products

Add validation in your product creation code:

```typescript
// In product creation/update endpoint
const INVALID_SKUS = ['facility', 'test', 'placeholder', 'warehouse', 'stock', 'default'];

if (INVALID_SKUS.includes(sku.toLowerCase())) {
  throw new Error(`SKU "${sku}" is reserved and cannot be used`);
}
```

## Why Database Trigger Won't Help

The reservations are **VALID** - they have:
- ✅ line_item_id (attached to orders)
- ✅ inventory_item_id (valid inventory item)
- ✅ location_id (valid warehouse)

The problem is the **product itself** has "facility" as SKU.

**A database trigger can't block valid reservations for real orders!**

## Implementation Script

Run this SQL to investigate and fix:

```sql
-- ============================================================================
-- Investigation Script
-- ============================================================================

-- 1. Find products with invalid SKUs
SELECT 
  'Product Variant' as type,
  pv.id,
  pv.sku,
  pv.title,
  p.title as product_title,
  p.status
FROM product_variant pv
JOIN product p ON pv.product_id = p.id
WHERE pv.sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');

-- 2. Find inventory items with invalid SKUs
SELECT 
  'Inventory Item' as type,
  id,
  sku,
  title
FROM inventory_item
WHERE sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');

-- 3. Count affected reservations
SELECT 
  ii.sku,
  COUNT(*) as reservation_count,
  SUM(ri.quantity) as total_quantity
FROM reservation_item ri
JOIN inventory_item ii ON ri.inventory_item_id = ii.id
WHERE ii.sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock')
  AND ri.deleted_at IS NULL
GROUP BY ii.sku;

-- 4. Check if orders exist for these products
SELECT 
  pv.sku,
  COUNT(DISTINCT o.id) as order_count,
  COUNT(li.id) as line_item_count,
  SUM(li.quantity) as total_sold
FROM line_item li
JOIN "order" o ON li.order_id = o.id
JOIN product_variant pv ON li.variant_id = pv.id
WHERE pv.sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock')
GROUP BY pv.sku;

-- ============================================================================
-- Cleanup Script (REVIEW BEFORE UNCOMMENTING!)
-- ============================================================================

/*
-- Delete invalid product variants
DELETE FROM product_variant 
WHERE sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');

-- Delete invalid inventory items
DELETE FROM inventory_item 
WHERE sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');

-- Verify cleanup
SELECT COUNT(*) as remaining_invalid_products 
FROM product_variant 
WHERE sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');

SELECT COUNT(*) as remaining_invalid_inventory 
FROM inventory_item 
WHERE sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock');
*/
```

## Summary

**The Fix:**
1. ❌ DON'T use database trigger (reservations are valid!)
2. ✅ Find and DELETE products with "facility" SKU
3. ✅ Delete inventory_items with "facility" SKU
4. ✅ Add validation to prevent creating products with reserved SKUs
5. ✅ Clean up old reservations

**Why This Happens:**
- Medusa uses "facility" as default location/warehouse name
- Someone created a product with SKU = location name
- Orders are placed for this invalid product
- Valid reservations created for invalid product
- Admin panel shows confusing "facility" entries

**Next Steps:**
1. Run investigation script
2. Delete the garbage products
3. Clean up database
4. Add SKU validation
5. Problem solved permanently! ✅
