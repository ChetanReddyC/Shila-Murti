-- Fix reservation quantity mismatch

-- Show the problem
SELECT 
  'BEFORE FIX' as status,
  ri.id as reservation_id,
  ri.quantity as reserved_quantity,
  oi.quantity as order_quantity,
  (ri.quantity - oi.quantity) as mismatch
FROM reservation_item ri
JOIN order_item oi ON ri.line_item_id = oi.item_id
WHERE ri.id = 'resitem_01K7HHZT63XNW9Q5BSEH62NS2F';

-- Fix the reservation quantity
UPDATE reservation_item 
SET 
  quantity = 1,
  raw_quantity = '{"value": "1", "precision": 20}'
WHERE id = 'resitem_01K7HHZT63XNW9Q5BSEH62NS2F';

-- Show the fix
SELECT 
  'AFTER FIX' as status,
  ri.id as reservation_id,
  ri.quantity as reserved_quantity,
  oi.quantity as order_quantity,
  CASE 
    WHEN ri.quantity = oi.quantity THEN '✅ Match!'
    ELSE '❌ Still wrong'
  END as result
FROM reservation_item ri
JOIN order_item oi ON ri.line_item_id = oi.item_id
WHERE ri.id = 'resitem_01K7HHZT63XNW9Q5BSEH62NS2F';

-- Check inventory levels
SELECT 
  'Inventory Status' as info,
  ii.sku,
  il.stocked_quantity,
  il.reserved_quantity,
  (il.stocked_quantity - il.reserved_quantity) as available_now
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';
