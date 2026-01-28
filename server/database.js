const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'moonlight.db');
const db = new Database(dbPath);
console.log('Database path:', dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

const initialize = () => {
  return new Promise((resolve, reject) => {
    try {
      // Create Categories table
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT,
          color TEXT,
          \`order\` INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Products table
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category_id TEXT,
          price REAL NOT NULL,
          cost_price REAL DEFAULT 0,
          stock INTEGER DEFAULT 0,
          min_stock INTEGER DEFAULT 5,
          image_url TEXT,
          is_active BOOLEAN DEFAULT 1,
          is_ingredient BOOLEAN DEFAULT 0,
          unit TEXT DEFAULT 'pièces',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )
      `);

      // Create Transactions table
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          reference TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          items TEXT NOT NULL,
          total_amount REAL NOT NULL,
          payment_method TEXT,
          status TEXT DEFAULT 'validated',
          partner_name TEXT,
          table_number TEXT,
          is_vip BOOLEAN DEFAULT 0,
          amount_paid REAL,
          amount_due REAL,
          payment_status TEXT DEFAULT 'paid',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Stock Movements table
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          movement_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          stock_before INTEGER NOT NULL,
          stock_after INTEGER NOT NULL,
          transaction_ref TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
      `);

      // Create Settings table
      db.exec(`
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
          tax_rate REAL DEFAULT 0,
          currency TEXT DEFAULT 'Ar',
          receipt_footer TEXT,
          vip_charge REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Expenses table
      db.exec(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          category TEXT,
          payment_method TEXT,
          date DATE NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Purchases table (for inventory/stock purchases)
      db.exec(`
        CREATE TABLE IF NOT EXISTS purchases (
          id TEXT PRIMARY KEY,
          product_id TEXT,
          product_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total_amount REAL NOT NULL,
          supplier_name TEXT,
          payment_method TEXT,
          date DATE NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        )
      `);

      // Create Ingredients table (for restaurant items)
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingredients (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          unit TEXT NOT NULL,
          stock_quantity REAL DEFAULT 0,
          min_stock REAL DEFAULT 0,
          unit_cost REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Product Ingredients junction table
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_ingredients (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          ingredient_id TEXT NOT NULL,
          quantity_required REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
        )
      `);

      // Create Ingredient Movements table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingredient_movements (
          id TEXT PRIMARY KEY,
          ingredient_id TEXT NOT NULL,
          ingredient_name TEXT NOT NULL,
          movement_type TEXT NOT NULL,
          quantity REAL NOT NULL,
          stock_before REAL NOT NULL,
          stock_after REAL NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ingredient_id) REFERENCES products(id) ON DELETE SET NULL
        )
      `);

      // Create Ingredient Usage Groups table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingredient_usage_groups (
          id TEXT PRIMARY KEY,
          reference TEXT UNIQUE NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Purchase Groups table (for grouped purchases)
      db.exec(`
        CREATE TABLE IF NOT EXISTS purchase_groups (
          id TEXT PRIMARY KEY,
          reference TEXT UNIQUE NOT NULL,
          supplier_name TEXT,
          payment_method TEXT,
          date DATE NOT NULL,
          status TEXT DEFAULT 'validated',
          total_amount REAL NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Purchase Group Items table
      db.exec(`
        CREATE TABLE IF NOT EXISTS purchase_group_items (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          product_id TEXT,
          product_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (group_id) REFERENCES purchase_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        )
      `);

      // Insert default settings if not exists
      const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
      if (settingsCount.count === 0) {
        db.prepare(`
          INSERT INTO settings (id, business_name, currency)
          VALUES ('default', 'Moonlight', 'Ar')
        `).run();
      }

      // Migration: Add vip_charge column to settings if it doesn't exist
      try {
        const settingsInfo = db.prepare("PRAGMA table_info(settings)").all();
        const hasVipCharge = settingsInfo.some(col => col.name === 'vip_charge');
        if (!hasVipCharge) {
          db.exec('ALTER TABLE settings ADD COLUMN vip_charge REAL DEFAULT 0');
          console.log('Added vip_charge column to settings table');
        }

        const hasNif = settingsInfo.some(col => col.name === 'nif');
        if (!hasNif) {
          db.exec('ALTER TABLE settings ADD COLUMN nif TEXT');
          console.log('Added nif column to settings table');
        }

        const hasStat = settingsInfo.some(col => col.name === 'stat');
        if (!hasStat) {
          db.exec('ALTER TABLE settings ADD COLUMN stat TEXT');
          console.log('Added stat column to settings table');
        }

        const hasTimezone = settingsInfo.some(col => col.name === 'timezone');
        if (!hasTimezone) {
          db.exec('ALTER TABLE settings ADD COLUMN timezone TEXT');
          console.log('Added timezone column to settings table');
        }
      } catch (error) {
        console.error('Migration error for settings:', error);
      }

      // Migration: Add payment tracking columns to transactions if they don't exist
      try {
        const transactionsInfo = db.prepare("PRAGMA table_info(transactions)").all();
        const hasAmountPaid = transactionsInfo.some(col => col.name === 'amount_paid');
        const hasAmountDue = transactionsInfo.some(col => col.name === 'amount_due');
        const hasPaymentStatus = transactionsInfo.some(col => col.name === 'payment_status');
        const hasPhoneNumber = transactionsInfo.some(col => col.name === 'phone_number');
        const hasTransactionRef = transactionsInfo.some(col => col.name === 'transaction_ref');

        if (!hasAmountPaid) {
          db.exec('ALTER TABLE transactions ADD COLUMN amount_paid REAL');
          console.log('Added amount_paid column to transactions table');
        }
        if (!hasAmountDue) {
          db.exec('ALTER TABLE transactions ADD COLUMN amount_due REAL');
          console.log('Added amount_due column to transactions table');
        }
        if (!hasPaymentStatus) {
          db.exec("ALTER TABLE transactions ADD COLUMN payment_status TEXT DEFAULT 'paid'");
          console.log('Added payment_status column to transactions table');
        }
        if (!hasPhoneNumber) {
          db.exec('ALTER TABLE transactions ADD COLUMN phone_number TEXT');
          console.log('Added phone_number column to transactions table');
        }
        if (!hasTransactionRef) {
          db.exec('ALTER TABLE transactions ADD COLUMN transaction_ref TEXT');
          console.log('Added transaction_ref column to transactions table');
        }
      } catch (error) {
        console.error('Migration error for transactions:', error);
      }

      // Migration: Convert absolute image URLs to relative paths
      try {
        const products = db.prepare('SELECT id, image_url FROM products WHERE image_url LIKE "http%"').all();
        if (products.length > 0) {
          console.log(`Found ${products.length} products with absolute image URLs. Migrating...`);
          const updateStmt = db.prepare('UPDATE products SET image_url = ? WHERE id = ?');
          let updatedCount = 0;

          db.transaction(() => {
            for (const product of products) {
              try {
                // Determine existing filename from URL
                // e.g., http://host/uploads/foo.png -> /uploads/foo.png
                // or just take everything after /uploads/
                const urlParts = product.image_url.split('/uploads/');
                if (urlParts.length > 1) {
                  const relativePath = '/uploads/' + urlParts[1];
                  updateStmt.run(relativePath, product.id);
                  updatedCount++;
                }
              } catch (e) {
                console.warn(`Could not migrate URL for product ${product.id}`);
              }
            }
          })();
          console.log(`Migrated ${updatedCount} product image URLs to relative paths.`);
        }
      } catch (error) {
        console.error('Migration error for image URLs:', error);
      }

      // Migration: Add status column to purchases table
      try {
        const purchasesInfo = db.prepare("PRAGMA table_info(purchases)").all();
        const hasStatus = purchasesInfo.some(col => col.name === 'status');
        if (!hasStatus) {
          db.exec("ALTER TABLE purchases ADD COLUMN status TEXT DEFAULT 'validated'");
          console.log('Added status column to purchases table');
        }
      } catch (error) {
        console.error('Migration error for purchases status:', error);
      }

      console.log('Database initialized successfully');
      resolve();
    } catch (error) {
      console.error('Database initialization error:', error);
      reject(error);
    }
  });
};

module.exports = {
  db,
  initialize
};
