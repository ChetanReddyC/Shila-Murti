-- Check product_variant_inventory_item associations
SELECT 
    pvii.variant_id,
    pvii.inventory_item_id,
    pv.sku as variant_sku,
    ii.sku as inventory_sku
FROM product_variant_inventory_item pvii
LEFT JOIN product_variant pv ON pvii.variant_id = pv.id
LEFT JOIN inventory_item ii ON pvii.inventory_item_id = ii.id
WHERE pv.sku = 'PURE-BLACK-ABSTRACT' OR ii.sku = 'PURE-BLACK-ABSTRACT';

-- Check if there's any association at all
SELECT COUNT(*) as association_count
FROM product_variant_inventory_item pvii
WHERE pvii.variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1';

-- If no association, create it
INSERT INTO product_variant_inventory_item (variant_id, inventory_item_id, required_quantity)
SELECT 
    'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1',
    'iitem_01K7E93C5X154Y3PGC5X80PF7P',
    1
WHERE NOT EXISTS (
    SELECT 1 FROM product_variant_inventory_item
    WHERE variant_id = 'variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1'
    AND inventory_item_id = 'iitem_01K7E93C5X154Y3PGC5X80PF7P'
);

-- Check sales channel associations for the location
SELECT 
    scl.sales_channel_id,
    scl.location_id,
    sc.name as sales_channel_name,
    sl.name as location_name
FROM sales_channel_location scl
LEFT JOIN sales_channel sc ON scl.sales_channel_id = sc.id
LEFT JOIN stock_location sl ON scl.location_id = sl.id
WHERE scl.location_id = 'sloc_01K7EB91C00HF74G6YK24PEVCZ';

-- Check if inventory item has location association
SELECT 
    iil.inventory_item_id,
    iil.location_id,
    il.stocked_quantity,
    il.reserved_quantity
FROM inventory_item_location iil
LEFT JOIN inventory_level il ON iil.inventory_item_id = il.inventory_item_id AND iil.location_id = il.location_id
WHERE iil.inventory_item_id = 'iitem_01K7E93C5X154Y3PGC5X80PF7P';
