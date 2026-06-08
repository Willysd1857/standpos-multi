-- ============================================================
-- Migration : Flux transit pour transferts d'emballages vides
-- Date : 2026-06-06
-- ============================================================

-- 1. Ajouter transfer_type à stock_transfers
--    (distinguish 'regular' product transfers from 'empty_packaging' transfers)
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS transfer_type TEXT DEFAULT 'regular';

-- 2. Enrichir stock_transfer_items avec le nom du produit,
--    les quantités cassées et les notes par item
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS broken_packaging_qty NUMERIC DEFAULT 0;

ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS broken_secondary_packaging_qty NUMERIC DEFAULT 0;

ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS item_notes TEXT;

-- 3. Enrichir losses_and_damages pour accepter les types de casse transport
--    (les champs nécessaires existent déjà : quantity, empty_packaging_qty, 
--     empty_secondary_packaging_qty, type, notes, responsible_user_id, is_reimbursed)
--    On s'assure juste que les colonnes optionnelles existent :
ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS is_reimbursed BOOLEAN DEFAULT false;

ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS empty_packaging_qty NUMERIC DEFAULT 0;

ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS empty_secondary_packaging_qty NUMERIC DEFAULT 0;

ALTER TABLE losses_and_damages
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 4. Index pour accélérer la récupération des transferts en transit par type
CREATE INDEX IF NOT EXISTS idx_transfers_type_status
  ON stock_transfers(transfer_type, status);
