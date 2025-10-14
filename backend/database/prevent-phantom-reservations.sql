-- ============================================================================
-- Database Trigger: Prevent Phantom Inventory Reservations
-- ============================================================================
-- This trigger blocks invalid/phantom reservations at the database level
-- Medusa cannot bypass this - it's enforced by PostgreSQL itself
-- ============================================================================

-- Step 1: Create the validation function
CREATE OR REPLACE FUNCTION block_phantom_reservations()
RETURNS TRIGGER AS $$
BEGIN
  -- Block reservations that have:
  -- 1. No line_item_id (not attached to an order)
  -- AND
  -- 2. Either: invalid SKU ("facility", "test", empty) OR no inventory_item_id
  
  IF NEW.line_item_id IS NULL THEN
    -- Check for invalid SKU
    IF NEW.sku IS NULL OR 
       NEW.sku = '' OR
       NEW.sku IN ('facility', 'test', 'placeholder', 'warehouse', 'stock') THEN
      
      RAISE WARNING 'Blocked phantom reservation with invalid SKU: sku=%, line_item_id=%, inventory_item_id=%', 
        NEW.sku, NEW.line_item_id, NEW.inventory_item_id;
      
      RAISE EXCEPTION 'Invalid reservation blocked: SKU "%" is not allowed without line_item_id', NEW.sku;
    END IF;
    
    -- Check for missing inventory_item_id
    IF NEW.inventory_item_id IS NULL THEN
      RAISE WARNING 'Blocked phantom reservation without inventory_item_id: sku=%, line_item_id=%', 
        NEW.sku, NEW.line_item_id;
      
      RAISE EXCEPTION 'Invalid reservation blocked: missing both line_item_id and inventory_item_id';
    END IF;
  END IF;
  
  -- If we get here, the reservation is valid
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Drop old trigger if it exists
DROP TRIGGER IF EXISTS prevent_phantom_reservations ON reservation_item;

-- Step 3: Create the trigger (fires BEFORE every INSERT)
CREATE TRIGGER prevent_phantom_reservations
  BEFORE INSERT ON reservation_item
  FOR EACH ROW
  EXECUTE FUNCTION block_phantom_reservations();

-- Step 4: Verify the trigger was created
SELECT 
  tgname as trigger_name, 
  CASE tgenabled 
    WHEN 'O' THEN 'Enabled'
    WHEN 'D' THEN 'Disabled'
    ELSE 'Unknown'
  END as status,
  tgtype as trigger_type
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass 
  AND tgname = 'prevent_phantom_reservations';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger "prevent_phantom_reservations" created successfully!';
  RAISE NOTICE '✅ All phantom reservations will now be blocked at database level';
  RAISE NOTICE '✅ Run the test script to verify it works';
END $$;
