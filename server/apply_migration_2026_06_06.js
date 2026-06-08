// Applique la migration 2026_06_06_customer_packaging_debt.sql à votre base Supabase.
// Usage : node apply_migration_2026_06_06.js
//
// ⚠️ Ce script ne fait qu'AFFICHER les instructions + le SQL prêt à coller.
//    Les exécutions DDL directes via PostgREST ne sont pas supportées par Supabase
//    (sécurité). Connectez-vous à votre dashboard Supabase > SQL Editor et collez
//    le contenu du fichier `migration_2026_06_06_customer_packaging_debt.sql`.

const fs = require('fs');
const path = require('path');

const migrationFile = path.join(__dirname, 'migration_2026_06_06_customer_packaging_debt.sql');
const sql = fs.readFileSync(migrationFile, 'utf8');

console.log('═══════════════════════════════════════════════════════════════════');
console.log(' MIGRATION 2026_06_06 — customer packaging debt');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('1) Ouvrez https://supabase.com/dashboard → votre projet → SQL Editor');
console.log('2) Collez le SQL ci-dessous et exécutez :');
console.log('');
console.log('─'.repeat(70));
console.log(sql);
console.log('─'.repeat(70));
console.log('');
console.log('Fichier source :', migrationFile);
