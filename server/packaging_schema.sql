-- SQL Script to create packaging tracking tables in Supabase
-- To be executed in the Supabase SQL Editor

-- 1. Create packaging_movements table
-- This table tracks all history of packaging movements (in, out, return, breakage)
CREATE TABLE IF NOT EXISTS public.packaging_movements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    location_id TEXT REFERENCES public.locations(id) ON DELETE SET NULL,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    movement_type TEXT NOT NULL, -- 'in' (réception), 'out' (vente), 'return' (retour fournisseur), 'consignment_return' (retour client), 'breakage' (casse)
    empty_packaging_qty INTEGER DEFAULT 0, -- Bouteilles vides
    empty_secondary_packaging_qty INTEGER DEFAULT 0, -- Cageots vides
    source_type TEXT, -- 'purchase', 'sale', 'loss', 'manual'
    source_id TEXT, -- ID de l'achat, vente ou perte lié
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT -- REFERENCES public.users(id) if applicable, but TEXT is safer
);

-- Enable RLS for packaging_movements
ALTER TABLE public.packaging_movements ENABLE ROW LEVEL SECURITY;

-- 2. Create packaging_consignments table
-- This table tracks consignments specifically (non-returned packages to suppliers or from clients)
CREATE TABLE IF NOT EXISTS public.packaging_consignments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    location_id TEXT REFERENCES public.locations(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'supplier' (fournisseur) or 'customer' (client)
    entity_id TEXT NOT NULL, -- supplier_id or customer_id
    entity_name TEXT NOT NULL, -- Nom du fournisseur ou client
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    empty_packaging_qty INTEGER DEFAULT 0, -- Bouteilles vides consignées
    empty_secondary_packaging_qty INTEGER DEFAULT 0, -- Cageots vides consignés
    packaging_deposit_value NUMERIC DEFAULT 0, -- Valeur unitaire de la bouteille
    secondary_packaging_deposit_value NUMERIC DEFAULT 0, -- Valeur unitaire du cageot
    status TEXT DEFAULT 'pending', -- 'pending' (en attente), 'returned' (retourné totalement), 'partial' (retour partiel)
    due_date TIMESTAMP WITH TIME ZONE, -- Date limite de retour calculée
    source_transaction_id TEXT, -- ID de l'achat ou vente
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for packaging_consignments
ALTER TABLE public.packaging_consignments ENABLE ROW LEVEL SECURITY;

-- Disable RLS policies for simplicity if the app uses service role or if we want to allow all authenticated users (similar to other tables if not strictly restricted)
CREATE POLICY "Allow all authenticated users to read packaging_movements"
ON public.packaging_movements FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert packaging_movements"
ON public.packaging_movements FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to read packaging_consignments"
ON public.packaging_consignments FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert packaging_consignments"
ON public.packaging_consignments FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update packaging_consignments"
ON public.packaging_consignments FOR UPDATE
TO authenticated USING (true);

-- 3. Add packaging_due_days column to settings table if it doesn't exist
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS packaging_due_days INTEGER DEFAULT 30;
