const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

/**
 * Script de vérification d'une sauvegarde Moonlight
 * Usage: node test_backup.js <chemin_vers_fichier.zip>
 */

const zipFilePath = process.argv[2];

if (!zipFilePath) {
    console.error('Usage: node test_backup.js <chemin_vers_fichier.zip>');
    process.exit(1);
}

if (!fs.existsSync(zipFilePath)) {
    console.error(`Erreur: Le fichier ${zipFilePath} n'existe pas.`);
    process.exit(1);
}

console.log('=== VÉRIFICATION DE LA SAUVEGARDE MOONLIGHT ===\n');
console.log(`Fichier: ${zipFilePath}`);
console.log(`Taille: ${(fs.statSync(zipFilePath).size / 1024 / 1024).toFixed(2)} MB\n`);

try {
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();

    console.log(`Nombre total d'entrées: ${zipEntries.length}\n`);

    // Check for database
    const dbEntry = zipEntries.find(entry => entry.entryName === 'moonlight.db');
    if (dbEntry) {
        console.log('✅ Base de données trouvée: moonlight.db');
        console.log(`   Taille: ${(dbEntry.header.size / 1024).toFixed(2)} KB\n`);
    } else {
        console.log('❌ Base de données NON TROUVÉE!\n');
    }

    // Check for uploads directory
    const uploadEntries = zipEntries.filter(entry => entry.entryName.startsWith('uploads/') && !entry.isDirectory);
    console.log(`📁 Dossier uploads:`);
    console.log(`   Nombre de fichiers: ${uploadEntries.length}`);

    if (uploadEntries.length > 0) {
        console.log(`   Fichiers images:`);
        uploadEntries.slice(0, 10).forEach(entry => {
            console.log(`   - ${entry.entryName} (${(entry.header.size / 1024).toFixed(2)} KB)`);
        });
        if (uploadEntries.length > 10) {
            console.log(`   ... et ${uploadEntries.length - 10} autres fichiers`);
        }
    } else {
        console.log('   ⚠️  Aucun fichier image trouvé dans uploads/');
    }

    console.log('\n=== STRUCTURE COMPLÈTE ===\n');
    zipEntries.forEach(entry => {
        const type = entry.isDirectory ? '[DIR]' : '[FILE]';
        const size = entry.isDirectory ? '' : `(${(entry.header.size / 1024).toFixed(2)} KB)`;
        console.log(`${type} ${entry.entryName} ${size}`);
    });

    console.log('\n=== RÉSUMÉ ===');
    console.log(`Base de données: ${dbEntry ? '✅' : '❌'}`);
    console.log(`Images produits: ${uploadEntries.length > 0 ? `✅ (${uploadEntries.length} fichiers)` : '⚠️  Aucune'}`);

    if (dbEntry && uploadEntries.length > 0) {
        console.log('\n✅ La sauvegarde semble complète et valide!');
    } else if (dbEntry && uploadEntries.length === 0) {
        console.log('\n⚠️  La sauvegarde contient la base de données mais aucune image.');
        console.log('   Cela peut être normal si aucun produit n\'a d\'image.');
    } else {
        console.log('\n❌ La sauvegarde est incomplète ou corrompue!');
    }

} catch (error) {
    console.error('Erreur lors de la lecture du fichier ZIP:', error);
    process.exit(1);
}
