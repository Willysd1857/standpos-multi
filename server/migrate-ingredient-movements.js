const { db } = require('./database');

console.log('🔧 Migration: Fixing ingredient_movements foreign key constraint');

try {
    // Check if table exists
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_movements'").get();

    if (!tableInfo) {
        console.log('✅ Table ingredient_movements does not exist yet, no migration needed');
        process.exit(0);
    }

    console.log('📋 Backing up existing data...');
    const existingData = db.prepare('SELECT * FROM ingredient_movements').all();
    console.log(`   Found ${existingData.length} existing records`);

    console.log('🗑️  Dropping old table...');
    db.exec('DROP TABLE IF EXISTS ingredient_movements');

    console.log('🆕 Creating new table with correct foreign key...');
    db.exec(`
        CREATE TABLE ingredient_movements (
            id TEXT PRIMARY KEY,
            ingredient_id TEXT NOT NULL,
            ingredient_name TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            stock_before REAL NOT NULL,
            stock_after REAL NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES products(id) ON DELETE SET NULL
        )
    `);

    if (existingData.length > 0) {
        console.log('📥 Restoring data...');
        const insert = db.prepare(`
            INSERT INTO ingredient_movements (id, ingredient_id, ingredient_name, movement_type, quantity, stock_before, stock_after, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((records) => {
            for (const record of records) {
                insert.run(
                    record.id,
                    record.ingredient_id,
                    record.ingredient_name,
                    record.movement_type,
                    record.quantity,
                    record.stock_before,
                    record.stock_after,
                    record.notes,
                    record.created_at
                );
            }
        });

        insertMany(existingData);
        console.log(`   ✅ Restored ${existingData.length} records`);
    }

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('You can now use the ingredient usage feature.');

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
}
