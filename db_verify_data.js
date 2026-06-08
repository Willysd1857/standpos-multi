const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'server', 'standpos.db');
const db = new Database(dbPath);

console.log('--- PAYMENTS (Latest 5) ---');
const payments = db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 5').all();
console.log(payments);

console.log('\n--- TRANSACTIONS (Latest 5) ---');
const txs = db.prepare('SELECT reference, total_amount, amount_paid, amount_due FROM transactions ORDER BY created_at DESC LIMIT 5').all();
console.log(txs);
