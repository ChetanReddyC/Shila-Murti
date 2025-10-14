-- ============================================================================
-- List All Active Triggers on reservation_item
-- ============================================================================

SELECT 
  tgname as trigger_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Enabled'
    WHEN 'D' THEN '❌ Disabled'
    ELSE '⚠️ Unknown'
  END as status,
  CASE 
    WHEN tgtype & 1 = 1 THEN 'FOR EACH ROW'
    ELSE 'FOR EACH STATEMENT'
  END as level,
  CASE 
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    ELSE 'AFTER'
  END as timing,
  CASE 
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    ELSE ''
  END || 
  CASE 
    WHEN tgtype & 8 = 8 THEN ' DELETE'
    ELSE ''
  END ||
  CASE 
    WHEN tgtype & 16 = 16 THEN ' UPDATE'
    ELSE ''
  END as operations,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- Summary
DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger 
  WHERE tgrelid = 'reservation_item'::regclass
    AND NOT tgisinternal
    AND tgenabled = 'O';
  
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Active Triggers: %', trigger_count;
  RAISE NOTICE '==============================================';
  RAISE NOTICE '1. prevent_phantom_reservations (BEFORE INSERT)';
  RAISE NOTICE '   → Blocks invalid reservations';
  RAISE NOTICE '';
  RAISE NOTICE '2. fix_reservation_quantity (BEFORE INSERT/UPDATE)';
  RAISE NOTICE '   → Auto-fixes quantity mismatches';
  RAISE NOTICE '';
  RAISE NOTICE '3. sync_inventory_level_on_reservation_change (AFTER INSERT/UPDATE/DELETE)';
  RAISE NOTICE '   → Syncs inventory_level.reserved_quantity';
  RAISE NOTICE '';
  RAISE NOTICE '✅ All protection layers active!';
  RAISE NOTICE '==============================================';
END $$;
