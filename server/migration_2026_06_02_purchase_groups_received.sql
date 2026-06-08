-- ============================================================
-- StandPOS - Migration: colonnes de traçabilité de réception
-- Date: 2026-06-02
-- ============================================================
-- Ce script ajoute à `purchase_groups` les colonnes utilisées
-- par /api/packaging/verify-reception pour tracer :
--   - la date de réception effective
--   - l'utilisateur qui a validé la réception
--
-- Contexte : sans ces colonnes, l'UPDATE
--   reception_status = 'received', status = 'validated',
--   received_at = now(), received_by = user.id
-- échoue silencieusement (PostgREST schema cache miss) et la
-- commande reste bloquée à `reception_status = 'pending'`,
-- donc elle réapparaît dans "Réceptions en attente".
-- ============================================================

-- 1. Date/heure de la réception (timestamp timestamptz ISO 8601)
ALTER TABLE public.purchase_groups
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- 2. Identifiant de l'utilisateur qui a validé la réception
--    Référence souple vers public.users (ON DELETE SET NULL
--    pour ne pas casser l'historique si un compte est supprimé)
ALTER TABLE public.purchase_groups
    ADD COLUMN IF NOT EXISTS received_by TEXT
    REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. (Optionnel mais recommandé) Index sur received_at pour les
--    rapports "réceptions du jour" / "réceptions par opérateur"
CREATE INDEX IF NOT EXISTS idx_purchase_groups_received_at
    ON public.purchase_groups(received_at)
    WHERE received_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_groups_received_by
    ON public.purchase_groups(received_by)
    WHERE received_by IS NOT NULL;

-- ============================================================
-- 4. Vérification finale (à exécuter après pour confirmer)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'purchase_groups'
--   AND column_name IN ('location_id', 'reception_status',
--                       'received_at', 'received_by')
-- ORDER BY column_name;
--
-- Résultat attendu : 4 lignes.
-- ============================================================

-- ============================================================
-- 5. Recharger le cache PostgREST (à exécuter après)
-- ============================================================
-- Après avoir appliqué ce DDL, PostgREST peut garder
-- l'ancien schéma en cache pendant ~30 secondes. Si
-- l'application renvoie encore "Could not find the
-- 'received_at' column" juste après, attendre 1 minute
-- et relancer la requête, OU forcer le rechargement via :
--
--   NOTIFY pgrst, 'reload schema';
--
-- (cette commande est safe à exécuter plusieurs fois)
-- ============================================================
