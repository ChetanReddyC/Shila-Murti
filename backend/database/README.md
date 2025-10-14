# Database Trigger for Phantom Reservation Prevention

## What This Does

Creates a PostgreSQL trigger that **blocks phantom inventory reservations at the database level**. This is impossible for Medusa to bypass.

## Files

1. **prevent-phantom-reservations.sql** - Creates the trigger
2. **test-trigger.sql** - Tests if trigger works
3. **cleanup-existing-phantoms.sql** - Removes old phantom reservations
4. **remove-trigger.sql** - Removes the trigger (if needed)

## Quick Start

### Step 1: Apply the Trigger

**Option A: Using psql (Command Line)**

```powershell
# Open PowerShell in backend folder
cd "C:\Users\chait\OneDrive\Desktop\Project-Shilamurthi\backend"

# Connect and apply trigger
psql -U postgres -d medusa-db-uvout -f database/prevent-phantom-reservations.sql
```

**Option B: Using pgAdmin (GUI)**

1. Open pgAdmin
2. Connect to `medusa-db-uvout` database
3. Click Tools → Query Tool
4. Open file: `database/prevent-phantom-reservations.sql`
5. Click Execute (⚡ button or F5)

### Step 2: Test the Trigger

```powershell
# Test it works
psql -U postgres -d medusa-db-uvout -f database/test-trigger.sql
```

Expected output:
```
✅ TEST PASSED: Phantom reservation was blocked!
✅ TEST PASSED: Valid reservation was allowed
```

### Step 3: Clean Up Existing Phantoms

```powershell
# Review what will be deleted
psql -U postgres -d medusa-db-uvout -f database/cleanup-existing-phantoms.sql

# Edit the file to uncomment DELETE section, then run again
```

### Step 4: Verify in Admin Panel

1. Open Medusa Admin: http://localhost:7001
2. Go to: Inventory → Reservations
3. "facility" SKU should be GONE ✅
4. Place a test order
5. Check reservations - should only see valid ones ✅

## How It Works

```
Any Code Tries to Insert Reservation
            ↓
    PostgreSQL Database
            ↓
    [Trigger Fires BEFORE Insert]
            ↓
    Validates Data
            ↓
    Valid? → Allow Insert ✅
    Invalid? → Block with Error ❌
```

**The trigger checks:**
- ❌ Block if: No line_item_id AND invalid SKU ("facility", "test", etc.)
- ❌ Block if: No line_item_id AND no inventory_item_id
- ✅ Allow if: Has line_item_id (valid order reservation)
- ✅ Allow if: Has inventory_item_id AND valid SKU

## Troubleshooting

### "psql command not found"

Add PostgreSQL to PATH or use full path:

```powershell
# Use full path
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d medusa-db-uvout -f database/prevent-phantom-reservations.sql
```

### "Password authentication failed"

```powershell
# You'll be prompted for password
psql -U postgres -d medusa-db-uvout

# Once connected, run:
\i database/prevent-phantom-reservations.sql
```

### "Database does not exist"

Check your database name:

```powershell
# List databases
psql -U postgres -l

# Use correct name from .env
cat .env | findstr DATABASE_URL
```

### Verify Trigger is Active

```sql
-- Connect to database
psql -U postgres -d medusa-db-uvout

-- Check trigger
SELECT tgname, tgenabled FROM pg_trigger 
WHERE tgrelid = 'reservation'::regclass;

-- Should show: prevent_phantom_reservations | O
-- (O means enabled)
```

## Remove Trigger (If Needed)

```sql
DROP TRIGGER IF EXISTS prevent_phantom_reservations ON reservation;
DROP FUNCTION IF EXISTS block_phantom_reservations();
```

Or run:
```powershell
psql -U postgres -d medusa-db-uvout -f database/remove-trigger.sql
```

## Monitoring

### Check for Blocked Attempts

```sql
-- View PostgreSQL logs
-- Blocked attempts will show as WARNINGS/ERRORS
SELECT * FROM pg_stat_statements WHERE query LIKE '%reservation%';
```

### Check Current Reservations

```sql
SELECT 
  id, sku, line_item_id, quantity, created_at,
  CASE 
    WHEN line_item_id IS NULL THEN '⚠️ Manual'
    ELSE '✅ Order'
  END as type
FROM reservation 
ORDER BY created_at DESC 
LIMIT 20;
```

## Success Criteria

✅ Trigger created without errors
✅ Test shows phantom blocked, valid allowed  
✅ Admin panel shows no "facility" reservations
✅ After placing order, only valid reservations appear
✅ No more phantom reservations after days of use

## Support

If trigger doesn't work:
1. Check PostgreSQL logs for errors
2. Verify database name matches .env
3. Ensure you have SUPERUSER privileges
4. Check trigger is enabled: `tgenabled = 'O'`
