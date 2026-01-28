const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'moonlight.db');
const db = new Database(dbPath);

console.log('🔧 Migration: Creating customers table and updating transactions');

try {
    // Create customers table
    db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            customer_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            first_transaction_date DATETIME NOT NULL,
            unpaid_count INTEGER DEFAULT 0,
            is_blocked BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Created customers table');

    // Check if customer_id column exists in transactions
    const transactionsInfo = db.prepare("PRAGMA table_info(transactions)").all();
    const hasCustomerId = transactionsInfo.some(col => col.name === 'customer_id');

    if (!hasCustomerId) {
        db.exec('ALTER TABLE transactions ADD COLUMN customer_id TEXT');
        console.log('✅ Added customer_id column to transactions table');
    } else {
        console.log('ℹ️  customer_id column already exists in transactions table');
    }

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Customer credit limit system is ready.');

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
}
