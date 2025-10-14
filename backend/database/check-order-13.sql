-- Check Order #13 details

SELECT 
  o.id,
  o.display_id,
  o.status,
  o.created_at,
  (NOW() - o.created_at) as order_age
FROM "order" o
WHERE o.display_id = 13;

-- Check items in Order #13
SELECT 
  oli.title as product,
  oi.quantity,
  oli.unit_price / 100.0 as unit_price_dollars
FROM order_item oi
JOIN order_line_item oli ON oi.item_id = oli.id
WHERE oi.order_id = 'order_01K7HHZSZH958SS9G2FK245E1R';

-- Check inventory levels
SELECT 
  ii.sku,
  ii.title,
  il.stocked_quantity,
  il.reserved_quantity,
  (il.stocked_quantity - il.reserved_quantity) as available
FROM inventory_level il
JOIN inventory_item ii ON il.inventory_item_id = ii.id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';
