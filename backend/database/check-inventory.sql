-- Check inventory levels for PURE-BLACK-ABSTRACT
SELECT 
    ii.id as inventory_item_id,
    ii.sku,
    il.location_id,
    il.stocked_quantity,
    il.reserved_quantity,
    il.incoming_quantity,
    (il.stocked_quantity - il.reserved_quantity) as available
FROM inventory_item ii
JOIN inventory_level il ON ii.id = il.inventory_item_id
WHERE ii.sku = 'PURE-BLACK-ABSTRACT';

-- Check reservations
SELECT 
    ri.id as reservation_id,
    ri.inventory_item_id,
    ri.location_id,
    ri.quantity as reserved_qty,
    li.variant_id,
    li.quantity as line_item_quantity,
    li.order_id
FROM reservation_item ri
LEFT JOIN line_item li ON ri.line_item_id = li.id
WHERE ri.inventory_item_id IN (
    SELECT id FROM inventory_item WHERE sku = 'PURE-BLACK-ABSTRACT'
);
