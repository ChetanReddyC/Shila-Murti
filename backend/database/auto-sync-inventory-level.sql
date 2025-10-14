-- ============================================================================
-- Auto-Sync Inventory Level Reserved Quantity
-- ============================================================================
-- This trigger keeps inventory_level.reserved_quantity in sync with actual
-- reservation_item totals whenever reservations change
-- ============================================================================

-- Drop old trigger/function if exists
DROP TRIGGER IF EXISTS sync_inventory_level_on_reservation_change ON reservation_item;
DROP FUNCTION IF EXISTS sync_inventory_level_reserved();

-- Create sync function
CREATE OR REPLACE FUNCTION sync_inventory_level_reserved()
RETURNS TRIGGER AS $$
DECLARE
  affected_inventory_id TEXT;
  total_reserved NUMERIC;
BEGIN
  -- Determine which inventory_item_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_inventory_id := OLD.inventory_item_id;
  ELSE
    affected_inventory_id := NEW.inventory_item_id;
  END IF;
  
  -- Calculate total reserved for this inventory item
  SELECT COALESCE(SUM(quantity), 0) INTO total_reserved
  FROM reservation_item
  WHERE inventory_item_id = affected_inventory_id
    AND deleted_at IS NULL;
  
  -- Update inventory_level
  UPDATE inventory_level
  SET 
    reserved_quantity = total_reserved,
    raw_reserved_quantity = jsonb_build_object('value', total_reserved::text, 'precision', 20),
    updated_at = NOW()
  WHERE inventory_item_id = affected_inventory_id;
  
  RAISE NOTICE '🔄 Synced inventory_level for item %: reserved_quantity = %', 
    affected_inventory_id, total_reserved;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER INSERT/UPDATE/DELETE on reservation_item
CREATE TRIGGER sync_inventory_level_on_reservation_change
  AFTER INSERT OR UPDATE OR DELETE ON reservation_item
  FOR EACH ROW
  EXECUTE FUNCTION sync_inventory_level_reserved();

-- Verify triggers
SELECT 
  tgname as trigger_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as status,
  CASE 
    WHEN tgtype & 1 = 1 THEN 'ROW'
    ELSE 'STATEMENT'
  END as level,
  CASE 
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    ELSE 'AFTER'
  END as timing
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass
  AND tgname LIKE '%sync%'
ORDER BY tgname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Auto-Sync Trigger Created!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'What it does:';
  RAISE NOTICE '  - Watches reservation_item table';
  RAISE NOTICE '  - Automatically updates inventory_level.reserved_quantity';
  RAISE NOTICE '  - Keeps them in sync in real-time';
  RAISE NOTICE '';
  RAISE NOTICE 'This prevents Medusa from showing wrong availability!';
  RAISE NOTICE '==============================================';
END $$;
