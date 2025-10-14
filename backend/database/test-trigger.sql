-- ============================================================================
-- Test Database Trigger
-- ============================================================================
-- This script tests if the trigger is working correctly
-- ============================================================================

-- Check if trigger exists
SELECT 
  tgname as trigger_name, 
  CASE tgenabled 
    WHEN 'O' THEN '✅ Enabled'
    WHEN 'D' THEN '❌ Disabled'
    ELSE '⚠️ Unknown'
  END as status
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass 
  AND tgname = 'prevent_phantom_reservations';

-- Test 1: Try to insert a phantom reservation with "facility" SKU (SHOULD FAIL)
DO $$
BEGIN
  BEGIN
    INSERT INTO reservation_item (id, sku, location_id, quantity, line_item_id, inventory_item_id, created_at, updated_at)
    VALUES ('test-phantom-1', 'facility', 'test-loc', 100, NULL, NULL, NOW(), NOW());
    
    RAISE NOTICE '❌ TEST FAILED: Phantom reservation was NOT blocked!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✅ TEST PASSED: Phantom reservation was blocked! Error: %', SQLERRM;
  END;
END $$;

-- Test 2: Try to insert a valid reservation (SHOULD SUCCEED)
DO $$
DECLARE
  test_id TEXT := 'test-valid-' || floor(random() * 1000000)::TEXT;
BEGIN
  BEGIN
    INSERT INTO reservation_item (id, sku, location_id, quantity, line_item_id, inventory_item_id, created_at, updated_at)
    VALUES (test_id, 'PRODUCT-123', 'test-loc', 1, 'li_test123', 'inv_test123', NOW(), NOW());
    
    -- Clean up test data
    DELETE FROM reservation_item WHERE id = test_id;
    
    RAISE NOTICE '✅ TEST PASSED: Valid reservation was allowed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ TEST FAILED: Valid reservation was blocked! Error: %', SQLERRM;
  END;
END $$;

-- Check current phantom reservations in database
SELECT 
  COUNT(*) as phantom_count,
  '❌ Phantom reservations found! Run cleanup script.' as action
FROM reservation_item 
WHERE line_item_id IS NULL 
  AND (sku IS NULL OR sku IN ('facility', 'test', 'placeholder') OR inventory_item_id IS NULL);

-- Show recent reservations
SELECT 
  id,
  sku,
  line_item_id,
  inventory_item_id,
  quantity,
  created_at,
  CASE 
    WHEN line_item_id IS NULL AND (sku IN ('facility', 'test') OR inventory_item_id IS NULL) THEN '❌ Phantom'
    ELSE '✅ Valid'
  END as status
FROM reservation_item 
ORDER BY created_at DESC 
LIMIT 10;
