-- Migration: add location_id and reception_status to purchase_groups
-- Date: 2026-06-01

ALTER TABLE public.purchase_groups
    ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_groups
    ADD COLUMN IF NOT EXISTS reception_status TEXT DEFAULT 'received';
    -- 'pending' = en transit, waiting for recipient reception
    -- 'received' = stock added to destination
    -- (NULL or default 'received' for old legacy rows / direct purchases)

-- Backfill: any existing validated purchase groups are considered 'received' (stock already in)
UPDATE public.purchase_groups
   SET reception_status = 'received'
 WHERE reception_status IS NULL;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_purchase_groups_reception_status
    ON public.purchase_groups(reception_status);

CREATE INDEX IF NOT EXISTS idx_purchase_groups_location_id
    ON public.purchase_groups(location_id);
