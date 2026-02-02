-- MagicQC Database Diagnostic Script
-- Run this in MySQL to verify data relationships

-- 1. Check all brands
SELECT 'BRANDS' as 'TABLE', COUNT(*) as 'COUNT' FROM brands;
SELECT id, name FROM brands;

-- 2. Check article types
SELECT 'ARTICLE_TYPES' as 'TABLE', COUNT(*) as 'COUNT' FROM article_types;
SELECT id, name FROM article_types;

-- 3. Check articles with their brand and type
SELECT 'ARTICLES' as 'TABLE', COUNT(*) as 'COUNT' FROM articles;
SELECT a.id, a.article_style, b.name as brand, at.name as article_type, a.brand_id, a.article_type_id
FROM articles a
LEFT JOIN brands b ON a.brand_id = b.id
LEFT JOIN article_types at ON a.article_type_id = at.id;

-- 4. Check measurements linked to articles
SELECT 'MEASUREMENTS' as 'TABLE', COUNT(*) as 'COUNT' FROM measurements;
SELECT m.id, m.code, m.measurement, m.tol_plus, m.tol_minus, m.article_id, a.article_style
FROM measurements m
LEFT JOIN articles a ON m.article_id = a.id;

-- 5. Check measurement sizes (spec values per size)
SELECT 'MEASUREMENT_SIZES' as 'TABLE', COUNT(*) as 'COUNT' FROM measurement_sizes;
SELECT ms.id, ms.measurement_id, ms.size, ms.value, ms.unit, m.code, m.measurement
FROM measurement_sizes ms
LEFT JOIN measurements m ON ms.measurement_id = m.id
ORDER BY ms.measurement_id, ms.size;

-- 6. Check purchase orders
SELECT 'PURCHASE_ORDERS' as 'TABLE', COUNT(*) as 'COUNT' FROM purchase_orders;
SELECT po.id, po.po_number, po.brand_id, b.name as brand FROM purchase_orders po
LEFT JOIN brands b ON po.brand_id = b.id;

-- 7. Check purchase order articles
SELECT 'PURCHASE_ORDER_ARTICLES' as 'TABLE', COUNT(*) as 'COUNT' FROM purchase_order_articles;
SELECT poa.id, poa.purchase_order_id, poa.article_style, poa.article_type_id, at.name as article_type
FROM purchase_order_articles poa
LEFT JOIN article_types at ON poa.article_type_id = at.id;

-- 8. CRITICAL: Check if brand_id + article_type_id combinations match
-- This query shows what PO articles exist and whether they have matching articles
SELECT 
    poa.id as po_article_id,
    poa.article_style as po_style,
    poa.article_type_id,
    po.brand_id,
    b.name as brand,
    at.name as article_type,
    (SELECT COUNT(*) FROM articles a WHERE a.brand_id = po.brand_id AND a.article_type_id = poa.article_type_id) as matching_articles
FROM purchase_order_articles poa
JOIN purchase_orders po ON poa.purchase_order_id = po.id
LEFT JOIN brands b ON po.brand_id = b.id
LEFT JOIN article_types at ON poa.article_type_id = at.id;

-- 9. CRITICAL: Full measurement data query (simulates what the app should fetch)
-- For Nike (brand_id=1) + T-Shirt (article_type_id=1) + Size M
SELECT 
    m.id,
    m.code,
    m.measurement,
    m.tol_plus,
    m.tol_minus,
    ms.size,
    ms.value as expected_value,
    ms.unit,
    a.article_style
FROM measurements m
JOIN measurement_sizes ms ON m.id = ms.measurement_id
JOIN articles a ON m.article_id = a.id
WHERE a.brand_id = 1 AND a.article_type_id = 1 AND ms.size = 'M'
ORDER BY m.code;
