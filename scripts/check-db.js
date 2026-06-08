const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../server/standpos.db');
const db = new Database(dbPath);

console.log('=== TABLES EXISTANTES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => console.log(`- ${t.name}`));

console.log('\n=== VÉRIFICATION: ingredient_usage_groups ===');
const hasUsageGroups = tables.some(t => t.name === 'ingredient_usage_groups');
console.log(`Table existe: ${hasUsageGroups ? 'OUI ✅' : 'NON ❌'}`);

if (!hasUsageGroups) {
    console.log('\n⚠️  PROBLÈME: La table ingredient_usage_groups est manquante!');
}

console.log('\n=== SCHÉMA DES TABLES LIÉES AUX INGRÉDIENTS ===');
const ingredientTables = ['ingredients', 'ingredient_movements', 'ingredient_usage_groups'];
ingredientTables.forEach(tableName => {
    const exists = tables.some(t => t.name === tableName);
    if (exists) {
        console.log(`\n${tableName}:`);
        const schema = db.prepare(`PRAGMA table_info(${tableName})`).all();
        schema.forEach(col => {
            console.log(`  - ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''})`);
        });
    } else {
        console.log(`\n${tableName}: ❌ TABLE MANQUANTE`);
    }
});

db.close();
