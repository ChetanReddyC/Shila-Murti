-- Check reservation fields
SELECT 
  ri.id,
  ri.description,
  ri.external_id,
  ri.metadata
FROM reservation_item ri
WHERE ri.deleted_at IS NULL;
