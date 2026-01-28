const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'moonlight.db');
const db = new Database(dbPath);

console.log('Nettoyage de la base de données...\n');

try {
    // Supprimer les tables inutilisées
    console.log('Suppression des tables obsolètes...');

    // Table ingredients (remplacée par products avec is_ingredient)
    db.exec('DROP TABLE IF EXISTS ingredients');
    console.log('✓ Table ingredients supprimée');

    // Table product_ingredients (non utilisée)
    db.exec('DROP TABLE IF EXISTS product_ingredients');
    console.log('✓ Table product_ingredients supprimée');

    // Table ingredient_movements (remplacée par stock_movements)
    db.exec('DROP TABLE IF EXISTS ingredient_movements');
    console.log('✓ Table ingredient_movements supprimée');

    console.log('\n✅ Nettoyage terminé avec succès!');
    console.log('\nTables restantes:');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    tables.forEach(t => console.log(`  - ${t.name}`));

} catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
} finally {
    db.close();
}
