const { db } = require('./server/database');
try {
    const categories = db.prepare("SELECT * FROM categories").all();
    console.log('ALL CATEGORIES:', JSON.stringify(categories, null, 2));
} catch (e) {
    console.error('ERROR:', e.message);
}
process.exit(0);
