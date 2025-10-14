-- ============================================================================
-- Prevent Reservation Quantity Mismatch
-- ============================================================================
-- This trigger automatically fixes reservations that have wrong quantity
-- Medusa bug: Sometimes reserves stock_qty instead of order_qty
-- ============================================================================

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS fix_reservation_quantity ON reservation_item;
DROP FUNCTION IF EXISTS validate_reservation_quantity();

-- Create validation function
CREATE OR REPLACE FUNCTION validate_reservation_quantity()
RETURNS TRIGGER AS $$
DECLARE
  line_item_qty NUMERIC;
BEGIN
  -- Only validate if line_item_id is present (order reservations)
  IF NEW.line_item_id IS NOT NULL THEN
    
    -- Get the actual line item quantity from order_item
    SELECT oi.quantity INTO line_item_qty
    FROM order_item oi
    WHERE oi.item_id = NEW.line_item_id
      AND oi.deleted_at IS NULL
    LIMIT 1;
    
    -- If we found the line item and quantities don't match
    IF line_item_qty IS NOT NULL AND NEW.quantity != line_item_qty THEN
      
      RAISE WARNING '🔧 Auto-fixing reservation quantity mismatch! Reservation: %, Ordered: %, Reserved: % → Fixed to: %', 
        NEW.id, line_item_qty, NEW.quantity, line_item_qty;
      
      -- Auto-fix the quantity
      NEW.quantity := line_item_qty;
      NEW.raw_quantity := json_build_object('value', line_item_qty::text, 'precision', 20)::jsonb;
      
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER fix_reservation_quantity
  BEFORE INSERT OR UPDATE ON reservation_item
  FOR EACH ROW
  EXECUTE FUNCTION validate_reservation_quantity();

-- Verify trigger created
SELECT 
  tgname as trigger_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as status
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass 
  AND tgname = 'fix_reservation_quantity';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Quantity Mismatch Prevention Trigger Created!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'What it does:';
  RAISE NOTICE '  - Checks reservation quantity vs order quantity';
  RAISE NOTICE '  - Auto-fixes if they don''t match';
  RAISE NOTICE '  - Logs warning when fix is applied';
  RAISE NOTICE '';
  RAISE NOTICE 'This prevents Medusa from reserving wrong quantities!';
  RAISE NOTICE '==============================================';
END $$;
