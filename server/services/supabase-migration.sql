-- Supabase PG Migration Script for StandPOS (ERP Multi-Locations)

-- 1. Locations (Emplacements)
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'warehouse', 'store'
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Suppliers (Fournisseurs)
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_info TEXT,
  phone TEXT,
  total_debt NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  "order" INTEGER DEFAULT 0,
  hidden_in_pos BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Packaging Types (Types d'emballages consignés)
CREATE TABLE IF NOT EXISTS packaging_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- 'Bouteille', 'Cageot'
  deposit_value NUMERIC NOT NULL DEFAULT 0,
  capacity INTEGER DEFAULT 1, -- e.g., 20 bottles in 1 crate
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  price NUMERIC NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  
  -- Legacy stock (To be phased out by stock_by_location)
  stock NUMERIC DEFAULT 0, 
  min_stock NUMERIC DEFAULT 5,
  
  -- Packaging fields
  has_packaging BOOLEAN DEFAULT false,
  packaging_type_id TEXT REFERENCES packaging_types(id) ON DELETE SET NULL,
  secondary_packaging_type_id TEXT REFERENCES packaging_types(id) ON DELETE SET NULL, -- e.g. the Crate
  units_per_secondary_packaging INTEGER DEFAULT 1, -- e.g. 20 bottles per crate
  
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_ingredient BOOLEAN DEFAULT false,
  unit TEXT DEFAULT 'pièces',
  track_stock BOOLEAN DEFAULT true,
  product_type TEXT DEFAULT 'direct',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Stock by Location (Gestion Multi-emplacements)
CREATE TABLE IF NOT EXISTS stock_by_location (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0, -- Produit plein
  empty_packaging_qty NUMERIC DEFAULT 0, -- Emballages vides principaux (bouteilles)
  empty_secondary_packaging_qty NUMERIC DEFAULT 0, -- Emballages vides secondaires (cageots)
  min_stock NUMERIC DEFAULT 5,
  last_inventory_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, product_id)
);

-- 7. Stock Transfers (Transferts entre entrepôts)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  from_location_id TEXT NOT NULL REFERENCES locations(id),
  to_location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'in_transit', 'completed', 'cancelled'
  notes TEXT,
  created_by TEXT NOT NULL,
  received_by TEXT,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Stock Transfer Items
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity NUMERIC NOT NULL, -- Quantité de pleins
  empty_packaging_qty NUMERIC DEFAULT 0, -- Retour d'emballages vides
  empty_secondary_packaging_qty NUMERIC DEFAULT 0, -- Retour de cageots vides
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  pin_code_hash TEXT, -- Sécurité par code PIN
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL, -- Restriction d'accès
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Transactions (Ventes)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  location_id TEXT REFERENCES locations(id), -- Lier la vente au magasin
  type TEXT NOT NULL,
  items TEXT NOT NULL, -- JSON string
  total_amount NUMERIC NOT NULL,
  payment_method TEXT,
  status TEXT DEFAULT 'validated',
  partner_name TEXT,
  phone_number TEXT,
  transaction_ref TEXT,
  table_number TEXT,
  is_vip BOOLEAN DEFAULT false,
  amount_paid NUMERIC,
  amount_due NUMERIC,
  payment_status TEXT DEFAULT 'paid',
  customer_id TEXT,
  amount_given NUMERIC,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone_number TEXT,
  first_transaction_date TIMESTAMPTZ,
  unpaid_count INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Settings
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  business_name TEXT,
  business_address TEXT,
  business_phone TEXT,
  business_email TEXT,
  business_logo TEXT,
  nif TEXT,
  stat TEXT,
  timezone TEXT,
  tax_rate NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'Ar',
  receipt_footer TEXT,
  vip_charge NUMERIC DEFAULT 0,
  exchange_rate_usd NUMERIC DEFAULT 4500,
  exchange_rate_eur NUMERIC DEFAULT 5000,
  enable_tables INTEGER DEFAULT 1,
  enable_ingredient_usage INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES locations(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT,
  payment_method TEXT,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. Supplier Transactions (Achats, dettes, paiements)
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  location_id TEXT REFERENCES locations(id), -- L'entrepôt qui reçoit
  type TEXT NOT NULL, -- 'purchase', 'payment', 'refund', 'packaging_return'
  reference TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  debt_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Purchase Group Items (Articles achetés)
CREATE TABLE IF NOT EXISTS purchase_group_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL, -- Sera lié au supplier_transactions(id)
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  packaging_cost NUMERIC DEFAULT 0, -- Valeur des consignes incluses
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Losses and Damages (Casses et Pertes)
CREATE TABLE IF NOT EXISTS losses_and_damages (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  product_id TEXT REFERENCES products(id),
  packaging_type_id TEXT REFERENCES packaging_types(id),
  quantity NUMERIC NOT NULL,
  type TEXT NOT NULL, -- 'broken_bottle', 'broken_crate', 'lost_bottle', 'lost_crate', 'expired_product'
  financial_value NUMERIC NOT NULL DEFAULT 0,
  responsible_user_id TEXT REFERENCES users(id), -- Celui qui rembourse
  refund_status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'deducted_from_salary'
  reported_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 17. Stock movements (Historique)
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES locations(id),
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit TEXT,
  movement_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  stock_before NUMERIC NOT NULL,
  stock_after NUMERIC NOT NULL,
  transaction_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 18. Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 19. Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- MIGRATION DES TABLES EXISTANTES (ALTER)
-- ==========================================
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_code_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS has_packaging BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS packaging_type_id TEXT REFERENCES packaging_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS secondary_packaging_type_id TEXT REFERENCES packaging_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_secondary_packaging INTEGER DEFAULT 1;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_stock_location ON stock_by_location(location_id, product_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions ON supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(location_id);

-- Seed Data Defaults

-- Create default locations
INSERT INTO locations (id, name, type) VALUES 
('loc-store', 'Magasin Principal', 'store'),
('loc-wh-1', 'Entrepôt 1 (Réception Fournisseur)', 'warehouse'),
('loc-wh-2', 'Entrepôt 2 (Transit)', 'warehouse')
ON CONFLICT (id) DO NOTHING;

-- Seed Settings
INSERT INTO settings (id, business_name, currency)
VALUES ('default', 'StandPOS', 'Ar')
ON CONFLICT (id) DO NOTHING;

-- Seed System User
INSERT INTO users (id, username, password_hash, full_name, role, is_active)
VALUES ('system', 'system', 'no-password', 'System Service', 'system', true)
ON CONFLICT (username) DO NOTHING;

-- Seed Admin (Default PIN: 1234 -> hashed via bcrypt)
-- Using a standard bcrypt hash for '1234'
INSERT INTO users (id, username, password_hash, pin_code_hash, full_name, role, is_active)
VALUES ('admin-default-id', 'admin', '$2a$10$H.7/C/2rW/rYg7Qd74/LueE.8Qh2Nq23O7q19rG2mP9g9Tz4oHk4Z', '$2a$10$tZ261jH23Q7DuxG4rRj8mOwZfKx4n5O3F4Kk4q2lP9g9Tz4oHk4Z.', 'Administrateur', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- Seed default packaging types
INSERT INTO packaging_types (id, name, deposit_value, capacity) VALUES
('pkg-bottle', 'Bouteille Consignée', 500, 1),
('pkg-crate-20', 'Cageot 20 Bouteilles', 5000, 20)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Migrations : Approvisionnement avec fournisseur, crédit, emballages
-- ============================================================

-- purchase_groups : enrichir avec fournisseur, paiement et emballages retournés
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES suppliers(id);
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'cash';
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS debt_amount NUMERIC DEFAULT 0;
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS returned_bottles NUMERIC DEFAULT 0;
ALTER TABLE purchase_groups ADD COLUMN IF NOT EXISTS returned_crates NUMERIC DEFAULT 0;

-- suppliers : suivi des emballages restant à rendre au fournisseur
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS outstanding_bottles NUMERIC DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS outstanding_crates NUMERIC DEFAULT 0;

-- supplier_transactions : ajouter due_date pour les crédits
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS due_date DATE;
