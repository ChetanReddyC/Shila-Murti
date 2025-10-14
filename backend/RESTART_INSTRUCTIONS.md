# How to Restart Medusa Backend

## Method 1: Kill and Restart

```powershell
# Open PowerShell in backend folder
cd C:\Users\chait\OneDrive\Desktop\Project-Shilamurthi\backend

# Find the process using port 9000
$process = Get-NetTCPConnection -LocalPort 9000 -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $process.OwningProcess -Force
    Write-Host "Killed backend process"
}

# Wait a moment
Start-Sleep -Seconds 2

# Restart
npm run dev
```

## Method 2: Task Manager
1. Press Ctrl+Shift+Esc
2. Find "Node.js" process
3. End Task
4. Run: `npm run dev` in backend folder

## After Restart

1. **Wait for backend to be ready** (shows "Medusa is ready")
2. **Open Medusa Admin**: http://localhost:7001
3. **Hard refresh browser**: Ctrl+Shift+R
4. **Check Variants view** - should show "99 available"
5. **Check Reservations view** - description should show

## If Order ID Still Shows "-"

This is a **Medusa Admin UI bug**. The data IS in the database:
- Check `external_id` field: "14" ✅
- Check `metadata`: {"order_display_id": 14} ✅

**Workaround**: Check Order # via metadata instead of external_id column.

## Verify Database is Correct

```powershell
# Connect to database
$env:PGPASSWORD="1050002526"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d medusa-db-uvout

# Run this SQL:
SELECT 
  ri.description,
  ri.external_id as order_id,
  ri.metadata->'order_display_id' as order_from_metadata
FROM reservation_item ri 
WHERE deleted_at IS NULL;

# Should show:
# description: Pure Black Abstract Art
# order_id: 14
# order_from_metadata: 14
```

Database is correct - UI just doesn't display it properly!
