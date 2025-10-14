-- Check if reservation's line_item is attached to an order

SELECT 
  'Reservation Details' as info,
  ri.id as reservation_id,
  ri.line_item_id,
  ri.quantity,
  ri.created_at
FROM reservation_item ri
WHERE ri.id = 'resitem_01K7HHZT63XNW9Q5BSEH62NS2F';

-- Check if line_item exists in order_line_item table
SELECT 
  'Line Item Details' as info,
  oli.id as line_item_id,
  oli.order_id,
  oli.quantity,
  oli.variant_id
FROM order_line_item oli
WHERE oli.id = 'ordli_01K7HHZSZJHFRF453TJQFPS0QG';

-- Check the order
SELECT 
  'Order Details' as info,
  o.id as order_id,
  o.display_id,
  o.status,
  o.created_at
FROM "order" o
WHERE o.id = (
  SELECT order_id FROM order_line_item WHERE id = 'ordli_01K7HHZSZJHFRF453TJQFPS0QG'
);

-- Full join to see the complete picture
SELECT 
  'Complete Picture' as info,
  ri.id as reservation_id,
  ri.quantity as reserved_qty,
  oli.id as line_item_id,
  oli.order_id,
  o.display_id as order_number,
  o.status as order_status
FROM reservation_item ri
LEFT JOIN order_line_item oli ON ri.line_item_id = oli.id
LEFT JOIN "order" o ON oli.order_id = o.id
WHERE ri.id = 'resitem_01K7HHZT63XNW9Q5BSEH62NS2F';
