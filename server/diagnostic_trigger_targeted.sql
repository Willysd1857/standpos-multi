-- Recherche ciblée du trigger qui synchronise products.stock
-- quand stock_by_location est modifiée.

SELECT
    c.relname AS table_name,
    t.tgname AS trigger_name,
    t.tgenabled AS enabled,
    t.tgtype AS type,
    pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND (
      c.relname = 'stock_by_location'
      OR (c.relname = 'products' AND t.tgtype & 8 = 8)  -- AFTER triggers
  )
ORDER BY c.relname, t.tgname;
