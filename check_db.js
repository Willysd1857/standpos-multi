const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'server/moonlight.db');
const db = new Database(dbPath);

console.log("Opening DB at", dbPath);

try {
    const info = db.prepare("PRAGMA table_info(transactions)").all();
    console.log("Columns:", info.map(c => c.name).join(', '));

    const hasPhone = info.some(col => col.name === 'phone_number');
    console.log("Has phone number:", hasPhone);

    if (!hasPhone) {
        console.log("Adding phone_number column...");
        db.exec('ALTER TABLE transactions ADD COLUMN phone_number TEXT');
        console.log("Column added successfully.");
    } else {
        console.log("Column already exists.");
    }
} catch (e) {
    console.error("Error:", e);
}
console.log("Script finished.");
