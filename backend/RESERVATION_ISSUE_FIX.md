# FINAL SOLUTION: "Facility" Reservation Issue

## Root Cause Identified ✅

**Product:** "Pure Black Abstract Art" (REAL published product)  
**Variant:** "Pure Black Abstract" (has NO SKU!)  
**Problem:** Variant has no SKU, so Medusa created inventory items with placeholder SKU "facility"

## The Chain of Events

```
1. Product created: "Pure Black Abstract Art"
2. Variant created: "Pure Black Abstract" (SKU was left EMPTY)
3. Medusa auto-creates inventory items with placeholder SKU: "facility"
4. Orders placed for this product
5. Reservations created with SKU "facility"
6. Admin panel shows confusing "facility" entries
```

## The Fix (2 Options)

### Option 1: Assign Proper SKU (RECOMMENDED)

**If this is a real product you want to keep:**

```sql
-- 1. Assign SKU to the variant
UPDATE product_variant 
SET sku = 'PURE-BLACK-ABSTRACT'  -- Use your SKU format
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- 2. Update inventory items to match
UPDATE inventory_item
SET sku = 'PURE-BLACK-ABSTRACT'
WHERE id IN ('iitem_01K7E93C5X154Y3PGC5X80PF7P', 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0');

-- 3. Verify
SELECT pv.sku as variant_sku, ii.sku as inventory_sku
FROM product_variant pv
JOIN product_variant_inventory_item pvi ON pv.id = pvi.variant_id
JOIN inventory_item ii ON pvi.inventory_item_id = ii.id
WHERE pv.id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';
```

### Option 2: Delete Product (if it's test data)

**If "Pure Black Abstract Art" is garbage/test data:**

```sql
-- This will cascade delete everything
DELETE FROM product WHERE id = 'prod_01K7E9CYHZ6A8DVKGPH2EN6J56';
```

## Quick Fix Script

Run this to fix it now:

```bash
cd backend
$env:PGPASSWORD="1050002526"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d medusa-db-uvout
```

Then in psql:

```sql
-- Assign proper SKU
UPDATE product_variant 
SET sku = 'PURE-BLACK-ABSTRACT' 
WHERE id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

UPDATE inventory_item 
SET sku = 'PURE-BLACK-ABSTRACT' 
WHERE id IN ('iitem_01K7E93C5X154Y3PGC5X80PF7P', 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0');

-- Verify fix
SELECT 'Fixed!' as status, ii.sku FROM inventory_item ii WHERE ii.id IN ('iitem_01K7E93C5X154Y3PGC5X80PF7P', 'iitem_01K7E9CYXP1WGWBB8Z82RGJSZ0');
```

## After Fixing

1. ✅ Restart Medusa backend
2. ✅ Check admin panel: http://localhost:7001/inventory/reservations
3. ✅ "facility" SKU should be replaced with "PURE-BLACK-ABSTRACT"
4. ✅ Place new order - should use proper SKU
5. ✅ Problem solved permanently!

## Prevent Future Issues

Add validation when creating products:

**File:** `src/api/admin/products/route.ts` (or wherever products are created)

```typescript
// Validate SKU before creating variant
if (!variant.sku || variant.sku.trim() === '') {
  throw new Error('Product variant must have a SKU');
}

const RESERVED_SKUS = ['facility', 'test', 'placeholder', 'warehouse', 'stock'];
if (RESERVED_SKUS.includes(variant.sku.toLowerCase())) {
  throw new Error(`SKU "${variant.sku}" is reserved and cannot be used`);
}
```

## Why This Happened

Medusa uses "facility" as the default warehouse/location name. When a variant is created without a SKU, Medusa generates inventory items and uses the location name ("facility") as a placeholder SKU.

**Best Practice:** Always assign SKUs to product variants!

## Summary

✅ Found: Product "Pure Black Abstract Art" has variant with NO SKU  
✅ Medusa created inventory items with placeholder SKU "facility"  
✅ Solution: Assign proper SKU to variant and inventory items  
✅ Prevention: Add SKU validation to product creation  
✅ Result: "facility" reservations disappear forever!  
