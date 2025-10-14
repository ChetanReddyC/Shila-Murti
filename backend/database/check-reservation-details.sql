-- Check reservation details and missing fields

SELECT 
  ri.id as reservation_id,
  ri.line_item_id,
  ri.description,
  ri.external_id,
  ri.metadata,
  ri.quantity,
  oi.order_id,
  o.display_id as order_number,
  oli.title as product_title
FROM reservation_item ri
LEFT JOIN order_item oi ON ri.line_item_id = oi.item_id
LEFT JOIN "order" o ON oi.order_id = o.id  
LEFT JOIN order_line_item oli ON oi.item_id = oli.id
WHERE ri.deleted_at IS NULL;

-- Check product variant
SELECT * FROM product_variant WHERE sku = 'PURE-BLACK-ABSTRACT';
