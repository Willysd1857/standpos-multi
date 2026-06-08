-- ============================================================
-- StandPOS - Migration pour les mises à jour Achats / Stock
-- Date : 2026-06-01
-- ============================================================
-- Ce script ajoute les colonnes nécessaires aux fonctionnalités :
--   1. Déclaration de casse d'emballages (audit log)
--   2. Approvisionnement avec fournisseur + crédit + emballages rendus
-- ============================================================
-- INSTRUCTIONS :
--   1. Ouvrir le SQL Editor de votre projet Supabase
--   2. Copier/coller ce script
--   3. Cliquer sur "Run"
--   4. Vérifier qu'aucune erreur n'apparaît
-- ============================================================
-- Le script est idempotent : il peut être exécuté plusieurs fois
-- sans erreur grâce à "IF NOT EXISTS".
-- ============================================================


-- ============================================================
-- 1. Table `purchase_groups` (Groupes d'approvisionnement)
-- ============================================================
-- Ajout du lien fournisseur, gestion du crédit, et suivi des
-- emballages rendus au fournisseur lors de l'achat.

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS supplier_id        TEXT    REFERENCES suppliers(id);

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS payment_type       TEXT    DEFAULT 'cash';
-- Valeurs possibles : 'cash' (comptant) | 'partial' (partiel) | 'credit' (à crédit)

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS paid_amount        NUMERIC DEFAULT 0;

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS debt_amount        NUMERIC DEFAULT 0;

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS due_date           DATE;

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS returned_bottles   NUMERIC DEFAULT 0;

ALTER TABLE purchase_groups
    ADD COLUMN IF NOT EXISTS returned_crates    NUMERIC DEFAULT 0;


-- ============================================================
-- 2. Table `suppliers` (Fournisseurs)
-- ============================================================
-- Suivi des emballages restant à rendre à chaque fournisseur.

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS outstanding_bottles NUMERIC DEFAULT 0;

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS outstanding_crates  NUMERIC DEFAULT 0;


-- ============================================================
-- 3. Table `supplier_transactions` (Transactions fournisseurs)
-- ============================================================
-- Ajout de la date d'échéance pour les crédits.

ALTER TABLE supplier_transactions
    ADD COLUMN IF NOT EXISTS due_date DATE;


-- ============================================================
-- 4. Index utiles pour les performances
-- ============================================================

-- Recherche des approvisionnements par fournisseur
CREATE INDEX IF NOT EXISTS idx_purchase_groups_supplier_id
    ON purchase_groups(supplier_id);

-- Recherche des crédits en cours (dette > 0)
CREATE INDEX IF NOT EXISTS idx_purchase_groups_debt
    ON purchase_groups(debt_amount)
    WHERE debt_amount > 0;

-- Recherche des échéances de crédit
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_due_date
    ON supplier_transactions(due_date)
    WHERE due_date IS NOT NULL;


-- ============================================================
-- 5. Vérification finale (optionnel - décommenter pour exécuter)
-- ============================================================
-- Cette requête affiche la structure mise à jour des tables.
-- Vous pouvez l'exécuter pour vérifier que tout est en place.

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('purchase_groups', 'suppliers', 'supplier_transactions')
--   AND column_name IN (
--     'supplier_id', 'payment_type', 'paid_amount', 'debt_amount', 'due_date',
--     'returned_bottles', 'returned_crates',
--     'outstanding_bottles', 'outstanding_crates'
--   )
-- ORDER BY table_name, column_name;


-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
