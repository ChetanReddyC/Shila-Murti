-- ============================================================================
-- Auto-Populate Reservation Metadata Trigger
-- ============================================================================
-- Automatically adds Order ID and Description when reservation is created
-- ============================================================================

-- Drop old version if exists
DROP TRIGGER IF EXISTS populate_reservation_metadata ON reservation_item;
DROP FUNCTION IF EXISTS populate_reservation_metadata();

-- Create function to populate metadata
CREATE OR REPLACE FUNCTION populate_reservation_metadata()
RETURNS TRIGGER AS $$
DECLARE
  order_rec RECORD;
BEGIN
  -- Only populate if line_item_id is present and fields are empty
  IF NEW.line_item_id IS NOT NULL THEN
    
    -- Get order and line item details
    SELECT 
      o.id as order_id,
      o.display_id as order_display_id,
      oli.title as product_title,
      oli.variant_sku
    INTO order_rec
    FROM order_item oi
    JOIN "order" o ON oi.order_id = o.id
    JOIN order_line_item oli ON oi.item_id = oli.id
    WHERE oi.item_id = NEW.line_item_id
    LIMIT 1;
    
    -- Populate fields if order found
    IF order_rec.order_id IS NOT NULL THEN
      
      -- Set description if empty
      IF NEW.description IS NULL OR NEW.description = '' THEN
        NEW.description := order_rec.product_title;
      END IF;
      
      -- Set external_id (Order#) if empty
      IF NEW.external_id IS NULL OR NEW.external_id = '' THEN
        NEW.external_id := order_rec.order_display_id::text;
      END IF;
      
      -- Add/merge metadata
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
        'order_id', order_rec.order_id,
        'order_display_id', order_rec.order_display_id,
        'product_title', order_rec.product_title,
        'variant_sku', order_rec.variant_sku,
        'auto_populated', true
      );
      
      RAISE NOTICE '✅ Auto-populated reservation metadata: Order #%, Product: %', 
        order_rec.order_display_id, order_rec.product_title;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (fires BEFORE INSERT/UPDATE)
CREATE TRIGGER populate_reservation_metadata
  BEFORE INSERT OR UPDATE ON reservation_item
  FOR EACH ROW
  EXECUTE FUNCTION populate_reservation_metadata();

-- Verify trigger
SELECT 
  tgname as trigger_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as status
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass
  AND tgname = 'populate_reservation_metadata';

-- List all triggers in correct order
SELECT 
  tgname as trigger_name,
  CASE 
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    ELSE 'AFTER'
  END as timing,
  CASE tgenabled 
    WHEN 'O' THEN '✅'
    ELSE '❌'
  END as status
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass
  AND NOT tgisinternal
ORDER BY 
  CASE WHEN tgtype & 2 = 2 THEN 1 ELSE 2 END, -- BEFORE triggers first
  tgname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ Auto-Populate Metadata Trigger Created!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger Execution Order:';
  RAISE NOTICE '  BEFORE INSERT/UPDATE:';
  RAISE NOTICE '    1. prevent_phantom_reservations';
  RAISE NOTICE '    2. fix_reservation_quantity';
  RAISE NOTICE '    3. populate_reservation_metadata ← NEW!';
  RAISE NOTICE '  AFTER INSERT/UPDATE/DELETE:';
  RAISE NOTICE '    4. sync_inventory_level_on_reservation_change';
  RAISE NOTICE '';
  RAISE NOTICE 'Future reservations will automatically have:';
  RAISE NOTICE '  ✅ Order ID (external_id)';
  RAISE NOTICE '  ✅ Description (product title)';
  RAISE NOTICE '  ✅ Full metadata (order info, SKU, etc.)';
  RAISE NOTICE '==============================================';
END $$;
