const { db } = require('./server/database');
try {
    const info = db.prepare("PRAGMA table_info(categories)").all();
    console.log('TABLE INFO:', JSON.stringify(info, null, 2));
} catch (e) {
    console.error('ERROR:', e.message);
}
process.exit(0);
