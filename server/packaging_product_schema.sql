-- 1. Ajouter les colonnes d'emballage à la table products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS has_packaging BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bottle_deposit_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS crate_deposit_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bottles_per_crate INTEGER DEFAULT 24;
