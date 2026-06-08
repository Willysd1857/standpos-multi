const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const supabase = require('../services/supabaseClient');

// Create temp directory for uploads if it doesn't exist
const tempDir = process.env.UPLOAD_PATH
    ? path.join(process.env.UPLOAD_PATH, 'temp')
    : path.join(__dirname, '../uploads/temp');

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

const tablesList = [
    'categories',
    'products',
    'transactions',
    'customers',
    'stock_movements',
    'settings',
    'expenses',
    'ingredients',
    'ingredient_movements',
    'ingredient_usage_groups',
    'purchase_groups',
    'purchase_group_items',
    'purchases',
    'payments',
    'recipes',
    'users',
    'audit_logs'
];

// Create Backup (ZIP)
router.get('/create', async (req, res) => {
    try {
        const uploadsPath = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');
        console.log('=== CRÉATION DE SAUVEGARDE CLOUD ===');
        console.log('Chemin Uploads:', uploadsPath);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const zipName = `standpos_cloud_backup_${timestamp}.zip`;

        // Set response headers for download
        res.attachment(zipName);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('error', (err) => {
            console.error('Erreur lors de la création de l\'archive:', err);
            res.status(500).json({ error: 'Erreur lors de la création de la sauvegarde' });
        });

        archive.pipe(res);

        // Fetch and append all database tables as JSON
        for (const table of tablesList) {
            console.log(`Exportation de la table ${table}...`);
            const { data, error } = await supabase.from(table).select('*');
            if (error) {
                console.warn(`Impossible d'exporter la table ${table}:`, error.message);
                continue;
            }
            archive.append(JSON.stringify(data || [], null, 2), { name: `db/${table}.json` });
        }

        // Append uploads directory
        if (fs.existsSync(uploadsPath)) {
            console.log('Ajout du dossier uploads au ZIP...');
            archive.directory(uploadsPath, 'uploads');
        } else {
            console.warn('ATTENTION: Dossier uploads non trouvé!');
        }

        archive.finalize();
        console.log('Finalisation de l\'archive...');
    } catch (error) {
        console.error('❌ Erreur globale lors du backup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restore Backup (ZIP)
router.post('/restore', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const zipPath = req.file.path;
    const targetUploadsPath = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');

    console.log('=== RESTAURATION DE SAUVEGARDE CLOUD ===');
    console.log('Fichier ZIP:', zipPath);
    console.log('Cible Uploads:', targetUploadsPath);

    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        console.log(`Nombre total d'entrées dans le ZIP: ${zipEntries.length}`);

        // Check if this is a new style cloud backup (has db/ folder with JSONs)
        const hasJsonDb = zipEntries.some(entry => entry.entryName.startsWith('db/') && entry.entryName.endsWith('.json'));

        if (!hasJsonDb) {
            fs.unlinkSync(zipPath);
            return res.status(400).json({ error: 'Sauvegarde invalide. Ce fichier ne contient pas les fichiers de données cloud (.json)' });
        }

        // 1. Restore Database Tables on Supabase
        for (const table of tablesList) {
            const entryName = `db/${table}.json`;
            const entry = zipEntries.find(e => e.entryName === entryName);

            if (entry) {
                console.log(`Restauration de la table ${table}...`);
                const fileContent = zip.readAsText(entry);
                const rows = JSON.parse(fileContent);

                if (Array.isArray(rows)) {
                    // Delete existing entries
                    const { error: delErr } = await supabase.from(table).delete().neq('id', 'null');
                    if (delErr) {
                        console.warn(`Erreur lors de la suppression de la table ${table}:`, delErr.message);
                    }

                    // Insert rows in batches of 100
                    if (rows.length > 0) {
                        const batchSize = 100;
                        for (let i = 0; i < rows.length; i += batchSize) {
                            const batch = rows.slice(i, i + batchSize);
                            const { error: insErr } = await supabase.from(table).insert(batch);
                            if (insErr) {
                                console.error(`Erreur lors de l'insertion dans ${table}:`, insErr.message);
                                throw insErr;
                            }
                        }
                    }
                    console.log(`✓ Table ${table} restaurée (${rows.length} lignes).`);
                }
            }
        }

        // 2. Clean and Extract Uploads
        if (!fs.existsSync(targetUploadsPath)) {
            fs.mkdirSync(targetUploadsPath, { recursive: true });
        }

        // Clean the uploads directory
        if (fs.existsSync(targetUploadsPath)) {
            console.log('Nettoyage du dossier uploads existant...');
            const existingFiles = fs.readdirSync(targetUploadsPath);
            existingFiles.forEach(file => {
                const filePath = path.join(targetUploadsPath, file);
                try {
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                    }
                } catch (err) {
                    console.warn(`Impossible de supprimer ${file}:`, err.message);
                }
            });
        }

        // Extract uploads
        const uploadEntries = zipEntries.filter(entry => entry.entryName.startsWith('uploads/'));
        let extractedCount = 0;

        uploadEntries.forEach(entry => {
            if (!entry.isDirectory) {
                try {
                    const fileName = path.basename(entry.entryName);
                    const targetPath = path.join(targetUploadsPath, fileName);
                    const fileContent = zip.readFile(entry);
                    fs.writeFileSync(targetPath, fileContent);
                    extractedCount++;
                } catch (err) {
                    console.error(`  Erreur extraction ${entry.entryName}:`, err.message);
                }
            }
        });

        console.log(`${extractedCount} fichiers extraits dans uploads.`);

        res.json({ success: true, message: 'Restauration réussie avec succès ! Les données cloud et les images locales ont été synchronisées.' });

    } catch (error) {
        console.error('❌ Erreur de restauration:', error);
        res.status(500).json({ error: `Échec de la restauration de la sauvegarde: ${error.message}` });
    } finally {
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        
        // Restart process to ensure all modules refresh
        setTimeout(() => {
            console.log('Restarting server after restore...');
            process.exit(0);
        }, 1000);
    }
});

module.exports = router;
