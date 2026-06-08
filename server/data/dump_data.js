const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'standpos.db');
console.log('Path:', dbPath);
try {
    const db = new Database(dbPath);
    const date = '2026-02-03';

    const txs = db.prepare("SELECT items, total_amount, amount_due FROM transactions WHERE type='vente' AND status='validated' AND DATE(created_at) = ?").all(date);
    console.log('--- Transactions today ---');
    console.log(JSON.stringify(txs, null, 2));

    console.log('--- Products involved ---');
    const products = db.prepare("SELECT id, name, price, cost_price FROM products").all();
    console.log(JSON.stringify(products, null, 2));

    console.log('--- Expenses today ---');
    const expenses = db.prepare("SELECT description, amount FROM expenses WHERE DATE(date) = ?").all(date);
    console.log(JSON.stringify(expenses, null, 2));

    db.close();
} catch (e) {
    console.error(e);
}
