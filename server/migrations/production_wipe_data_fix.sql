-- ============================================================
-- FIX PRODUCTION : Wipe Data (Tout réinitialiser)
-- Date : 2026-06-11
-- Contexte : Le bouton "Tout réinitialiser" vide bien les
--   données en localhost mais pas en production (Render + Supabase).
-- Causes identifiées :
--   1. SUPABASE_SERVICE_ROLE_KEY absente des variables d'env Render
--      → le serveur utilise la clé ANON → RLS bloque les écritures
--   2. stock_by_location est dans la liste DELETE → violé par FK
--   3. Pas de politiques DELETE sur la plupart des tables pour
--      le rôle anon/authenticated
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- À EXÉCUTER DANS LE SQL EDITOR DU SUPABASE DASHBOARD
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 1 : VIDER FORCÉMENT TOUTES LES DONNÉES TRANSACTIONNELLES
-- (Ordre respectant les contraintes FK : enfants avant parents)
-- ═══════════════════════════════════════════════════════════════

-- Désactiver temporairement les triggers FK pour éviter les erreurs
SET session_replication_role = 'replica';

-- 1a. Tables transactionnelles (aucune dépendance entrante)
DELETE FROM audit_logs;
DELETE FROM losses_and_damages;
DELETE FROM supplier_transactions;
DELETE FROM stock_transfer_items;
DELETE FROM stock_transfers;
DELETE FROM packaging_consignments;
DELETE FROM packaging_movements;
DELETE FROM ingredient_usage_groups;
DELETE FROM ingredient_movements;
DELETE FROM purchases;
DELETE FROM purchase_group_items;
DELETE FROM purchase_groups;
DELETE FROM expenses;
DELETE FROM stock_movements;
DELETE FROM payments;
DELETE FROM transactions;

-- 1b. stock_by_location : UPDATE à zéro au lieu de DELETE
-- (préserve les lignes et les FK, remet juste les quantités à 0)
UPDATE stock_by_location SET
  quantity = 0,
  empty_packaging_qty = 0,
  empty_secondary_packaging_qty = 0;

-- 1c. Remise à zéro des compteurs clients
UPDATE customers SET
  unpaid_count = 0,
  is_blocked = false,
  packaging_debt_bottles = 0,
  packaging_debt_crates = 0;

-- 1d. Remise à zéro des dettes fournisseurs
UPDATE suppliers SET
  total_debt = 0,
  outstanding_bottles = 0,
  outstanding_crates = 0;

-- 1e. Remise à zéro du stock produits
UPDATE products SET stock = 0;

-- Réactiver les triggers FK
SET session_replication_role = 'origin';

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 2 : AJOUT DES POLICIES DELETE MANQUANTES (fallback RLS)
-- Utile si le serveur tombe sur la clé ANON sans service_role.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'transactions', 'payments', 'stock_movements', 'expenses',
    'purchase_groups', 'purchase_group_items', 'purchases',
    'ingredient_movements', 'ingredient_usage_groups',
    'packaging_movements', 'packaging_consignments',
    'stock_transfer_items', 'stock_transfers',
    'supplier_transactions', 'losses_and_damages',
    'stock_by_location', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Allow authenticated delete on %s" ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS "Allow service_role all on %s" ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "Allow authenticated delete on %s" ON %I FOR DELETE USING (
        auth.role() = ''authenticated'' OR auth.role() = ''service_role''
      )',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 3 : VÉRIFICATIONS POST-EXÉCUTION
-- ═══════════════════════════════════════════════════════════════

-- 3a. Vérifier que les quantités stock_by_location sont bien à 0
SELECT
  COUNT(*) AS total_locations,
  SUM(quantity) AS sum_quantity,
  SUM(empty_packaging_qty) AS sum_empty_packaging_qty,
  SUM(empty_secondary_packaging_qty) AS sum_empty_secondary_packaging_qty
FROM stock_by_location;

-- 3b. Vérifier que les tables transactionnelles sont vides
SELECT 'transactions' AS table_name, COUNT(*) AS row_count FROM transactions
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'purchase_groups', COUNT(*) FROM purchase_groups
UNION ALL SELECT 'purchase_group_items', COUNT(*) FROM purchase_group_items
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'packaging_movements', COUNT(*) FROM packaging_movements
UNION ALL SELECT 'packaging_consignments', COUNT(*) FROM packaging_consignments
UNION ALL SELECT 'stock_transfers', COUNT(*) FROM stock_transfers
UNION ALL SELECT 'stock_transfer_items', COUNT(*) FROM stock_transfer_items
UNION ALL SELECT 'supplier_transactions', COUNT(*) FROM supplier_transactions
UNION ALL SELECT 'losses_and_damages', COUNT(*) FROM losses_and_damages
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
ORDER BY table_name;

-- 3c. Vérifier les policies DELETE récemment créées
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE cmd = 'DELETE'
ORDER BY tablename;

-- ═══════════════════════════════════════════════════════════════
-- NOTE : VÉRIFICATION ENVIRONMENT VARIABLES SUR RENDER
-- Dans le dashboard Render.com :
--   Service → standpos-api → Environment → Env Variables
-- VÉRIFIER que cette variable est présente :
--   SUPABASE_SERVICE_ROLE_KEY = (la clé de service)
-- Sans elle, le backend utilise la clé ANON et les écritures
-- seront bloquées par RLS (même avec les policies ci-dessus
-- si le client Supabase n'a pas de session JWT utilisateur).
-- ═══════════════════════════════════════════════════════════════
