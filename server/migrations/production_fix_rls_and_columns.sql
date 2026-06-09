-- ============================================================
-- FIX PRODUCTION : RLS Policies + Column Verification
-- Date : 2026-06-09
-- Contexte : Le bouton "Expédier le transfert" fonctionne en
--   local mais pas en production (Supabase).
-- Cause probable : RLS bloque les écritures, ou colonnes
--   manquantes dans stock_transfer_items / stock_by_location.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 1 : Vérification des colonnes manquantes
-- ═══════════════════════════════════════════════════════════════

-- 1a. Colonnes de la migration empty_packaging_transit sur stock_transfers
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS transfer_type TEXT DEFAULT 'regular';

-- 1b. Colonnes de stock_transfer_items
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS sent_empty_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS sent_empty_secondary_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS broken_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS broken_secondary_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS item_notes TEXT;

-- 1c. Colonnes de stock_by_location (s'assurer que les emballages vides existent)
ALTER TABLE stock_by_location
  ADD COLUMN IF NOT EXISTS empty_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE stock_by_location
  ADD COLUMN IF NOT EXISTS empty_secondary_packaging_qty NUMERIC DEFAULT 0;

-- 1d. Colonnes de losses_and_damages
ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS is_reimbursed BOOLEAN DEFAULT false;
ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS empty_packaging_qty NUMERIC DEFAULT 0;
ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS empty_secondary_packaging_qty NUMERIC DEFAULT 0;

-- 1e. Index pour les transferts
CREATE INDEX IF NOT EXISTS idx_transfers_type_status
  ON stock_transfers(transfer_type, status);
CREATE INDEX IF NOT EXISTS idx_stock_location
  ON stock_by_location(location_id, product_id);

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 2 : RLS Policies (Row Level Security)
-- Le serveur utilise SUPABASE_SERVICE_ROLE_KEY pour bypasser
-- le RLS, mais si cette clé est manquante en production,
-- la clé ANON est utilisée et le RLS bloque les écritures.
-- On crée des policies qui autorisent les opérations pour
-- les utilisateurs authentifiés (JWT valide).
-- ═══════════════════════════════════════════════════════════════

-- ─── 2a. stock_transfers ──────────────────────────────────────
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent (idempotent)
DROP POLICY IF EXISTS "Allow authenticated insert on stock_transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Allow authenticated update on stock_transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Allow authenticated select on stock_transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Allow service_role all on stock_transfers" ON stock_transfers;

-- Politique SELECT : les utilisateurs voient les transferts liés à leur emplacement
CREATE POLICY "Allow authenticated select on stock_transfers"
  ON stock_transfers FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- Politique INSERT : les utilisateurs authentifiés peuvent créer des transferts
CREATE POLICY "Allow authenticated insert on stock_transfers"
  ON stock_transfers FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- Politique UPDATE : les utilisateurs authentifiés peuvent mettre à jour
CREATE POLICY "Allow authenticated update on stock_transfers"
  ON stock_transfers FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ─── 2b. stock_transfer_items ─────────────────────────────────
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert on stock_transfer_items" ON stock_transfer_items;
DROP POLICY IF EXISTS "Allow authenticated update on stock_transfer_items" ON stock_transfer_items;
DROP POLICY IF EXISTS "Allow authenticated select on stock_transfer_items" ON stock_transfer_items;
DROP POLICY IF EXISTS "Allow service_role all on stock_transfer_items" ON stock_transfer_items;

CREATE POLICY "Allow authenticated select on stock_transfer_items"
  ON stock_transfer_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated insert on stock_transfer_items"
  ON stock_transfer_items FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated update on stock_transfer_items"
  ON stock_transfer_items FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ─── 2c. stock_by_location ────────────────────────────────────
ALTER TABLE stock_by_location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert on stock_by_location" ON stock_by_location;
DROP POLICY IF EXISTS "Allow authenticated update on stock_by_location" ON stock_by_location;
DROP POLICY IF EXISTS "Allow authenticated select on stock_by_location" ON stock_by_location;
DROP POLICY IF EXISTS "Allow service_role all on stock_by_location" ON stock_by_location;

CREATE POLICY "Allow authenticated select on stock_by_location"
  ON stock_by_location FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated insert on stock_by_location"
  ON stock_by_location FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated update on stock_by_location"
  ON stock_by_location FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ─── 2d. packaging_movements ──────────────────────────────────
ALTER TABLE packaging_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert on packaging_movements" ON packaging_movements;
DROP POLICY IF EXISTS "Allow authenticated select on packaging_movements" ON packaging_movements;
DROP POLICY IF EXISTS "Allow service_role all on packaging_movements" ON packaging_movements;

CREATE POLICY "Allow authenticated select on packaging_movements"
  ON packaging_movements FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated insert on packaging_movements"
  ON packaging_movements FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ─── 2e. losses_and_damages ───────────────────────────────────
ALTER TABLE losses_and_damages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert on losses_and_damages" ON losses_and_damages;
DROP POLICY IF EXISTS "Allow authenticated select on losses_and_damages" ON losses_and_damages;
DROP POLICY IF EXISTS "Allow service_role all on losses_and_damages" ON losses_and_damages;

CREATE POLICY "Allow authenticated select on losses_and_damages"
  ON losses_and_damages FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated insert on losses_and_damages"
  ON losses_and_damages FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ─── 2f. products (UPDATE du stock global) ─────────────────────
-- La table products a peut-être déjà des policies, on ajoute/update
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated update on products" ON products;
DROP POLICY IF EXISTS "Allow authenticated select on products" ON products;
DROP POLICY IF EXISTS "Allow service_role all on products" ON products;

CREATE POLICY "Allow authenticated select on products"
  ON products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow authenticated update on products"
  ON products FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════
-- PARTIE 3 : Vérification post-exécution
-- Exécute ces SELECT pour confirmer que tout est en place
-- ═══════════════════════════════════════════════════════════════

-- Vérifier les colonnes de stock_transfer_items
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'stock_transfer_items'
  AND column_name IN (
    'product_name', 'sent_empty_packaging_qty',
    'sent_empty_secondary_packaging_qty',
    'broken_packaging_qty', 'broken_secondary_packaging_qty',
    'item_notes', 'empty_packaging_qty', 'empty_secondary_packaging_qty'
  )
ORDER BY column_name;

-- Vérifier les colonnes de stock_transfers
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'stock_transfers'
  AND column_name IN ('transfer_type', 'shipped_at')
ORDER BY column_name;

-- Vérifier les policies RLS actives
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN (
  'stock_transfers', 'stock_transfer_items',
  'stock_by_location', 'packaging_movements',
  'losses_and_damages', 'products'
)
ORDER BY tablename, policyname;
