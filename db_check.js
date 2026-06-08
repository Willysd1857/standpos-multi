const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'server', 'standpos.db');
const db = new Database(dbPath);

console.log('--- CUSTOMERS ---');
const customers = db.prepare('SELECT * FROM customers').all();
console.log(customers);

console.log('\n--- TRANSACTIONS (Unpaid) ---');
const unpaid = db.prepare('SELECT reference, partner_name, phone_number, amount_due, customer_id FROM transactions WHERE amount_due > 0').all();
console.log(unpaid);
