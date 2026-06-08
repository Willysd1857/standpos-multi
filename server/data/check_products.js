const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'standpos.db');
console.log('Using DB at:', dbPath);
try {
    const db = new Database(dbPath);
    const products = db.prepare("SELECT id, name, price, cost_price FROM products WHERE name LIKE '%THB%'").all();
    console.log(JSON.stringify(products, null, 2));
    db.close();
} catch (e) {
    console.error(e);
}
