-- Colonnes de dette d'emballages par client
-- Suivi automatique : incrémenté à la création d'une consigne client,
-- décrémenté lors d'un retour (FIFO ou direct).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS packaging_debt_bottles NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_debt_crates NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_packaging_debt
  ON public.customers (packaging_debt_bottles, packaging_debt_crates)
  WHERE packaging_debt_bottles > 0 OR packaging_debt_crates > 0;
