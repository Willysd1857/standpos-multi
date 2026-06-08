const { db } = require('./server/database');
const reportDate = '2026-02-08';

const sales = db.prepare(`
    SELECT 
        id,
        total_amount,
        amount_due,
        type,
        status,
        created_at
    FROM transactions
    WHERE type = 'vente' AND status = 'validated' AND DATE(created_at) = ?
`).all(reportDate);

console.log('Transactions today:', JSON.stringify(sales, null, 2));

const payments = db.prepare(`
    SELECT 
        id,
        transaction_id,
        amount,
        payment_method,
        created_at
    FROM payments
    WHERE DATE(created_at) = ?
`).all(reportDate);

console.log('Payments today:', JSON.stringify(payments, null, 2));

const expenses = db.prepare(`
    SELECT amount, description, date
    FROM expenses
    WHERE date LIKE ?
`).all(reportDate + '%');

console.log('Expenses today:', JSON.stringify(expenses, null, 2));
