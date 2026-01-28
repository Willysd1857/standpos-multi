const Database = require('better-sqlite3');
const path = require('path');

// Ouvrir la base de données
const dbPath = path.join(__dirname, 'moonlight.db');
const db = new Database(dbPath);

console.log('Migration: Ajout des colonnes is_ingredient et unit...');

try {
    // Vérifier si la colonne existe déjà
    const tableInfo = db.prepare("PRAGMA table_info(products)").all();
    const hasIsIngredient = tableInfo.some(col => col.name === 'is_ingredient');
    const hasUnit = tableInfo.some(col => col.name === 'unit');

    if (!hasIsIngredient) {
        db.exec('ALTER TABLE products ADD COLUMN is_ingredient BOOLEAN DEFAULT 0');
        console.log('✓ Colonne is_ingredient ajoutée');
    } else {
        console.log('✓ Colonne is_ingredient existe déjà');
    }

    if (!hasUnit) {
        db.exec('ALTER TABLE products ADD COLUMN unit TEXT DEFAULT "pièces"');
        console.log('✓ Colonne unit ajoutée');
    } else {
        console.log('✓ Colonne unit existe déjà');
    }

    console.log('\n✅ Migration terminée avec succès!');
} catch (error) {
    console.error('❌ Erreur lors de la migration:', error.message);
    process.exit(1);
} finally {
    db.close();
}
