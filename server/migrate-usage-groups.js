const Database = require('better-sqlite3');
const path = require('path');

// Ouvrir la base de données
const dbPath = path.join(__dirname, 'moonlight.db');
const db = new Database(dbPath);

console.log('Migration: Ajout de la table ingredient_usage_groups...');

try {
    // Créer la table si elle n'existe pas
    db.exec(`
    CREATE TABLE IF NOT EXISTS ingredient_usage_groups (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    console.log('✓ Table ingredient_usage_groups créée');

    // Vérifier que la table existe
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_usage_groups'").all();
    if (tables.length > 0) {
        console.log('✓ Table vérifiée avec succès');
    }

    console.log('\n✅ Migration terminée avec succès!');
} catch (error) {
    console.error('❌ Erreur lors de la migration:', error.message);
    process.exit(1);
} finally {
    db.close();
}
