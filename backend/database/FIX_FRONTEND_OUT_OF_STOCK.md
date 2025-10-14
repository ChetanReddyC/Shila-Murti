# Fix Frontend "Out of Stock" Issue

## Root Cause

**Frontend shows "Out of Stock" even though database has 99 units available!**

### Why This Happens:

1. **Frontend Code** (productDataMapper.ts line 177):
   ```typescript
   if (typeof variant.inventory_quantity === 'number') {
     variantQuantity = Math.max(0, variant.inventory_quantity);
   ```
   Frontend relies on `variant.inventory_quantity` from Medusa Store API

2. **Medusa v2 Issue**:
   - Store API doesn't return `inventory_quantity` field automatically
   - Need to explicitly request inventory data
   - Or configure publishable key with sales channel/location mapping

## The Fix

### Option 1: Update Frontend to Use inventory_items (RECOMMENDED)

Medusa v2 Store API provides inventory via `/store/products/:id?fields=*variants.inventory_items*`

**Update productDataMapper.ts:**

```typescript
// Around line 165-190, replace the inventory extraction logic:

static extractInventoryInfo(product: Product): AggregatedInventoryInfo {
  if (!product.variants || product.variants.length === 0) {
    return {
      inStock: false,
      quantity: 0,
      allowBackorder: false,
      managed: false,
      status: 'out_of_stock',
      totalQuantity: 0,
      availableVariants: 0,
      totalVariants: 0
    };
  }

  const totalVariants = product.variants.length;
  let totalQuantity = 0;
  let availableVariants = 0;
  let hasBackorderVariants = false;
  let hasManagedInventory = false;
  let hasUnmanagedVariants = false;

  for (const variant of product.variants) {
    let variantQuantity = 0;
    
    // Medusa v2: Check inventory_items array
    if (variant.inventory_items && variant.inventory_items.length > 0) {
      for (const invItem of variant.inventory_items) {
        // Sum up available quantity from all inventory locations
        if (invItem.inventory && invItem.inventory.length > 0) {
          for (const inv of invItem.inventory) {
            const stocked = inv.stocked_quantity || 0;
            const reserved = inv.reserved_quantity || 0;
            variantQuantity += Math.max(0, stocked - reserved);
          }
        }
      }
    }
    // Fallback: Check inventory_quantity (v1 style)
    else if (typeof variant.inventory_quantity === 'number') {
      variantQuantity = Math.max(0, variant.inventory_quantity);
    }
    // Fallback: Unmanaged inventory
    else if (!variant.manage_inventory) {
      variantQuantity = Infinity;
      hasUnmanagedVariants = true;
    }

    totalQuantity += variantQuantity;

    if (variant.allow_backorder) {
      hasBackorderVariants = true;
    }
    if (variant.manage_inventory) {
      hasManagedInventory = true;
    }

    const variantOrderable = !variant.manage_inventory
      ? true
      : (variantQuantity > 0) || variant.allow_backorder;

    if (variantOrderable) {
      availableVariants++;
    }
  }

  const inStock = availableVariants > 0;
  const status = totalQuantity > 0
    ? 'in_stock'
    : (hasBackorderVariants || hasUnmanagedVariants)
      ? 'backorder'
      : 'out_of_stock';

  return {
    inStock,
    quantity: totalQuantity,
    allowBackorder: hasBackorderVariants || hasUnmanagedVariants,
    managed: hasManagedInventory,
    status,
    totalQuantity,
    availableVariants,
    totalVariants
  };
}
```

**Update medusaApiClient.ts to request inventory fields:**

```typescript
// In getProducts() method, around line ~200:
async getProducts(params?: ProductListParams): Promise<ProductListResponse> {
  const queryParams = new URLSearchParams();
  
  // Add inventory fields to response
  queryParams.append('fields', '*variants.inventory_items.inventory.*');
  
  // ... rest of the method
}
```

### Option 2: Backend API Endpoint (Simpler)

Create a custom endpoint that returns inventory:

**File: `backend/src/api/store/products/[id]/inventory/route.ts`**

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const productId = req.params.id

  const inventoryService = req.scope.resolve("inventoryService")
  const productService = req.scope.resolve("productService")

  // Get product variants
  const product = await productService.retrieve(productId, {
    relations: ["variants", "variants.inventory_items"]
  })

  const inventoryData = {}

  for (const variant of product.variants) {
    let available = 0
    
    for (const invItem of variant.inventory_items || []) {
      const levels = await inventoryService.listInventoryLevels({
        inventory_item_id: invItem.inventory_item_id
      })
      
      for (const level of levels) {
        available += (level.stocked_quantity - level.reserved_quantity)
      }
    }
    
    inventoryData[variant.id] = {
      available,
      in_stock: available > 0 || variant.allow_backorder
    }
  }

  res.json({ inventory: inventoryData })
}
```

Then call this from frontend when loading product.

### Option 3: Quick Fix (Temporary)

**Disable inventory check on frontend:**

In `productDataMapper.ts`:

```typescript
// Around line 175, force inStock to true if manage_inventory is true:
if (variant.manage_inventory) {
  // Temporary: Assume in stock if managed
  // TODO: Fix to actually check inventory levels
  variantQuantity = 100; // or fetch from custom endpoint
}
```

## The REAL Solution

**The issue is Medusa v2 changed how inventory is returned!**

Medusa v1: `variant.inventory_quantity` (single number)
Medusa v2: `variant.inventory_items[].inventory[]` (array of locations)

Your frontend code is written for v1, but you're running v2!

## Immediate Fix

Run this SQL to check what Medusa version you have:

```sql
SELECT version FROM migrations ORDER BY run_on DESC LIMIT 1;
```

Then either:
1. Update frontend to use v2 inventory structure
2. Or create backend endpoint that provides v1-style inventory_quantity

## Testing

After fix:
1. Restart frontend: `npm run dev`
2. Open product page
3. Should show "In Stock" with 99 available
4. "Add to Cart" button should work

Let me know which option you want and I'll implement it!
