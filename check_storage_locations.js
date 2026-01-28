const path = require('path');
const fs = require('fs');

/**
 * Script pour afficher les emplacements de stockage de Moonlight
 * Utile pour diagnostiquer les problèmes de sauvegarde/restauration
 */

console.log('=== EMPLACEMENTS DE STOCKAGE MOONLIGHT ===\n');

// Mode développement
const devDbPath = path.join(__dirname, 'server', 'moonlight.db');
const devUploadsPath = path.join(__dirname, 'server', 'uploads');

console.log('📁 MODE DÉVELOPPEMENT (npm run dev):');
console.log(`   Base de données: ${devDbPath}`);
console.log(`   Existe: ${fs.existsSync(devDbPath) ? '✅' : '❌'}`);
console.log(`   Uploads: ${devUploadsPath}`);
console.log(`   Existe: ${fs.existsSync(devUploadsPath) ? '✅' : '❌'}`);

if (fs.existsSync(devUploadsPath)) {
    const files = fs.readdirSync(devUploadsPath);
    console.log(`   Fichiers: ${files.length}`);
}

console.log('\n📱 MODE ELECTRON (.exe):');

// Simuler le chemin Electron
// En vrai, Electron utilise app.getPath('userData')
// Sur Windows: C:\Users\USERNAME\AppData\Roaming\moonlight-bar
const username = process.env.USERNAME || process.env.USER;
const electronUserData = path.join(
    process.env.APPDATA || path.join(process.env.HOME || process.env.USERPROFILE, 'AppData', 'Roaming'),
    'moonlight-bar'
);

const electronDbPath = path.join(electronUserData, 'moonlight.db');
const electronUploadsPath = path.join(electronUserData, 'uploads');

console.log(`   Dossier utilisateur: ${electronUserData}`);
console.log(`   Existe: ${fs.existsSync(electronUserData) ? '✅' : '❌'}`);
console.log(`   Base de données: ${electronDbPath}`);
console.log(`   Existe: ${fs.existsSync(electronDbPath) ? '✅' : '❌'}`);
console.log(`   Uploads: ${electronUploadsPath}`);
console.log(`   Existe: ${fs.existsSync(electronUploadsPath) ? '✅' : '❌'}`);

if (fs.existsSync(electronUploadsPath)) {
    const files = fs.readdirSync(electronUploadsPath);
    console.log(`   Fichiers: ${files.length}`);
    if (files.length > 0) {
        console.log(`   Exemples: ${files.slice(0, 3).join(', ')}`);
    }
}

console.log('\n=== VARIABLES D\'ENVIRONNEMENT ===');
console.log(`DB_PATH: ${process.env.DB_PATH || '(non défini)'}`);
console.log(`UPLOAD_PATH: ${process.env.UPLOAD_PATH || '(non défini)'}`);
console.log(`IS_ELECTRON: ${process.env.IS_ELECTRON || '(non défini)'}`);

console.log('\n=== INSTRUCTIONS ===');
console.log('1. En mode développement, les données sont dans le dossier "server/"');
console.log('2. En mode Electron, les données sont dans %APPDATA%\\moonlight-bar\\');
console.log('3. Pour copier manuellement les images:');
console.log(`   - Copiez le dossier: ${devUploadsPath}`);
console.log(`   - Vers: ${electronUploadsPath}`);
console.log('\n4. Pour ouvrir le dossier Electron dans l\'explorateur:');
console.log(`   - Appuyez sur Win+R`);
console.log(`   - Tapez: %APPDATA%\\moonlight-bar`);
console.log(`   - Appuyez sur Entrée`);
