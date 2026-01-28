const { db } = require('./database');

console.log('Starting image URL migration...');

try {
    // 1. Get all products
    const products = db.prepare('SELECT id, image_url FROM products WHERE image_url LIKE "http%"').all();

    console.log(`Found ${products.length} products with absolute image URLs.`);

    let updatedCount = 0;

    const updateStmt = db.prepare('UPDATE products SET image_url = ? WHERE id = ?');

    db.transaction(() => {
        for (const product of products) {
            try {
                const url = new URL(product.image_url);
                // Check if it looks like our uploads path
                if (url.pathname.startsWith('/uploads/')) {
                    const relativePath = url.pathname;
                    updateStmt.run(relativePath, product.id);
                    updatedCount++;
                    console.log(`Updated product ${product.id}: ${product.image_url} -> ${relativePath}`);
                }
            } catch (e) {
                console.warn(`Could not parse URL for product ${product.id}: ${product.image_url}`);
            }
        }
    })();

    console.log(`Migration complete. Updated ${updatedCount} products.`);

} catch (error) {
    console.error('Migration failed:', error);
}
