-- ============================================================================
-- Remove Phantom Reservation Prevention Trigger
-- ============================================================================
-- Use this if you need to remove the trigger for any reason
-- ============================================================================

-- Remove the trigger
DROP TRIGGER IF EXISTS prevent_phantom_reservations ON reservation_item;

-- Remove the function
DROP FUNCTION IF EXISTS block_phantom_reservations();

-- Verify removal
SELECT 
  COUNT(*) as remaining_triggers
FROM pg_trigger 
WHERE tgrelid = 'reservation_item'::regclass 
  AND tgname = 'prevent_phantom_reservations';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger and function removed successfully';
  RAISE NOTICE '⚠️ Phantom reservations are no longer blocked';
END $$;
