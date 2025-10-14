# How to Apply the Inventory Sync Fix

## The Problem

After placing an order, the product shows "Out of Stock" again even though inventory exists.

**Root Cause:**
- Reservations have correct quantity (e.g., 1 item ordered)
- But `inventory_level.reserved_quantity` doesn't sync and shows wrong value (e.g., 100)
- This causes Medusa to think there's no stock available

## The Solution

Run the SQL fix file to:
1. Sync `inventory_level.reserved_quantity` with actual reservation totals
2. Create a database trigger to auto-sync future changes

## How to Run

### Option 1: Using psql command line

```bash
cd C:\Users\chait\OneDrive\Desktop\Project-Shilamurthi\backend\database
psql -U postgres -d medusa-store -f FIX_INVENTORY_SYNC.sql
```

### Option 2: Using pgAdmin

1. Open pgAdmin
2. Connect to `medusa-store` database
3. Open Query Tool
4. Load `FIX_INVENTORY_SYNC.sql` file
5. Click Execute (F5)

### Option 3: Using DBeaver / Other DB Tool

1. Connect to PostgreSQL database `medusa-store`
2. Open SQL Editor
3. Paste contents of `FIX_INVENTORY_SYNC.sql`
4. Execute the script

## What It Does

### Step 1: Shows Current State
- Displays current inventory levels
- Shows the mismatch between `reserved_quantity` and actual reservations

### Step 2: Fixes the Sync
- Updates `inventory_level.reserved_quantity` to match actual reservation totals
- Applies to ALL inventory items (not just PURE-BLACK-ABSTRACT)

### Step 3: Verifies the Fix
- Shows updated inventory levels
- Confirms reserved quantities are now in sync

### Step 4: Creates Auto-Sync Trigger
- Creates a PostgreSQL trigger that watches the `reservation_item` table
- Whenever a reservation is created/updated/deleted:
  - Automatically recalculates the total reserved quantity
  - Updates `inventory_level.reserved_quantity` to match
  - Keeps them in sync in real-time

### Step 5: Verifies Trigger
- Confirms the trigger was created and is enabled

## After Running

1. **Restart your Medusa backend** to ensure clean state
2. **Refresh your frontend** in the browser
3. **Product should now show "In Stock"** with correct availability
4. **Try placing another order** - availability should update correctly now

## Testing the Fix

1. Check product page - should show "In Stock"
2. Add to cart - should work without "insufficient inventory" error
3. Place an order
4. Check product page again - should show correct available quantity (not out of stock)
5. Check Medusa Admin - inventory should be correct

## Troubleshooting

### If psql asks for password:
```bash
# Set password as environment variable
set PGPASSWORD=your_postgres_password
psql -U postgres -d medusa-store -f FIX_INVENTORY_SYNC.sql
```

### If you get "database not found":
```bash
# List databases
psql -U postgres -l

# Connect to correct database name
psql -U postgres -d your_medusa_db_name -f FIX_INVENTORY_SYNC.sql
```

### If trigger creation fails:
- You may need superuser privileges
- Try running pgAdmin as Administrator
- Or contact your database administrator

## What This Fixes

- ✅ Products showing "Out of Stock" when inventory exists
- ✅ "Insufficient inventory" errors when adding to cart
- ✅ Inventory not updating correctly after orders
- ✅ Reserved quantity mismatch between tables
- ✅ Future orders will have correct inventory tracking

## Files Created

- `FIX_INVENTORY_SYNC.sql` - The complete fix (run this)
- `HOW_TO_RUN_FIX.md` - This instruction file

---

**Note:** This is a permanent fix. Once the trigger is created, it will continue working even after restarts.
