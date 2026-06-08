const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'server', 'standpos.db');
const db = new Database(dbPath);

console.log('--- Transactions Table ---');
const txInfo = db.prepare("PRAGMA table_info(transactions)").all();
console.log(txInfo.map(c => `${c.name} (${c.type})`).join(', '));

console.log('\n--- Audit Logs Table ---');
try {
    const auditInfo = db.prepare("PRAGMA table_info(audit_logs)").all();
    console.log(auditInfo.map(c => `${c.name} (${c.type})`).join(', '));
} catch (e) {
    console.log('Audit logs table missing or error:', e.message);
}

console.log('\n--- Recent Transactions ---');
const recentTx = db.prepare("SELECT id, reference, total_amount, items, status FROM transactions ORDER BY created_at DESC LIMIT 5").all();
recentTx.forEach(tx => {
    console.log(`${tx.reference} - Status: ${tx.status}, Total: ${tx.total_amount}`);
    console.log(`Items: ${tx.items}`);
});
