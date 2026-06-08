-- ============================================================
-- StandPOS - DIAGNOSTIC: lister les triggers sur products /
-- stock_by_location qui pourraient modifier products.stock
-- automatiquement (ex: trigger qui synchronise products.stock
-- à chaque INSERT/UPDATE sur stock_by_location).
-- ============================================================
-- Ce script est READ-ONLY : il ne modifie rien, il liste juste
-- les triggers pour qu'on puisse les inspecter.
-- ============================================================

-- 1. Tous les triggers sur `products`
SELECT
    n.nspname AS schema,
    c.relname AS table_name,
    t.tgname AS trigger_name,
    t.tgenabled AS enabled,
    pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND c.relname IN ('products', 'stock_by_location', 'purchase_groups')
ORDER BY c.relname, t.tgname;

-- 2. Toutes les fonctions qui touchent `products.stock`
--    (utilisé pour repérer un éventuel trigger ou vue matérialisée)
SELECT
    n.nspname AS schema,
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%products%'
  AND p.prosrc ILIKE '%stock%'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY p.proname;

-- 3. Compter les lignes de stock_by_location pour le produit de test
--    (Gold blonde = 6af9bc5f-c358-418e-bd93-ff44832670cc)
SELECT
    location_id,
    product_id,
    quantity,
    empty_packaging_qty,
    empty_secondary_packaging_qty,
    updated_at
FROM public.stock_by_location
WHERE product_id = '6af9bc5f-c358-418e-bd93-ff44832670cc';
