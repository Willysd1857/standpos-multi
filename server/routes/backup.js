const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { db } = require('../database');

const upload = multer({ dest: 'uploads/temp/' });

// Create Backup (ZIP)
router.get('/create', (req, res) => {
    // Determine paths
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../moonlight.db');
    const uploadsPath = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');

    console.log('=== CRÉATION DE SAUVEGARDE ===');
    console.log('Chemin DB:', dbPath);
    console.log('Chemin Uploads:', uploadsPath);
    console.log('DB existe:', fs.existsSync(dbPath));
    console.log('Uploads existe:', fs.existsSync(uploadsPath));

    // Count files in uploads
    if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath);
        console.log(`Nombre de fichiers dans uploads: ${files.length}`);
        console.log('Fichiers:', files.slice(0, 5).join(', ') + (files.length > 5 ? '...' : ''));
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `moonlight_backup_${timestamp}.zip`;

    // Set response headers for download
    res.attachment(zipName);

    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    // Error handling for archive
    archive.on('error', (err) => {
        console.error('Erreur lors de la création de l\'archive:', err);
        res.status(500).json({ error: 'Erreur lors de la création de la sauvegarde' });
    });

    // Log progress
    archive.on('progress', (progress) => {
        console.log(`Archive progress: ${progress.entries.processed}/${progress.entries.total} fichiers`);
    });

    // Pipe archive data to the response
    archive.pipe(res);

    // Append database file
    if (fs.existsSync(dbPath)) {
        console.log('Ajout de la base de données au ZIP...');
        archive.file(dbPath, { name: 'moonlight.db' });
    } else {
        console.warn('ATTENTION: Base de données non trouvée!');
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
});

// Restore Backup (ZIP)
router.post('/restore', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const zipPath = req.file.path;
    const targetDbPath = process.env.DB_PATH || path.join(__dirname, '../moonlight.db');
    const targetUploadsPath = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');

    console.log('=== RESTAURATION DE SAUVEGARDE ===');
    console.log('Fichier ZIP:', zipPath);
    console.log('Cible DB:', targetDbPath);
    console.log('Cible Uploads:', targetUploadsPath);

    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        console.log(`Nombre total d'entrées dans le ZIP: ${zipEntries.length}`);

        // Log all entries for debugging
        zipEntries.forEach(entry => {
            console.log(`  - ${entry.entryName} (${entry.isDirectory ? 'DIR' : 'FILE'})`);
        });

        // 1. Validate structure (check for moonlight.db)
        const hasDb = zipEntries.some(entry => entry.entryName === 'moonlight.db');
        const uploadEntries = zipEntries.filter(entry => entry.entryName.startsWith('uploads/'));

        console.log(`Base de données trouvée: ${hasDb}`);
        console.log(`Fichiers uploads trouvés: ${uploadEntries.length}`);

        if (!hasDb) {
            fs.unlinkSync(zipPath);
            return res.status(400).json({ error: 'Invalid backup file: moonlight.db not found' });
        }

        // 2. Close DB Connection to allow overwrite (Better-sqlite3 synchronous close)
        try {
            if (db.open) {
                db.close();
                console.log('Database connection closed for restore.');
            }
        } catch (e) {
            console.error('Error closing DB:', e);
        }

        // 3. Extract DB
        console.log('Extraction de la base de données...');
        zip.extractEntryTo("moonlight.db", path.dirname(targetDbPath), false, true); // overwrite
        console.log('Base de données extraite avec succès.');


        // 4. Clean and Extract Uploads
        // Ensure uploads directory exists
        if (!fs.existsSync(targetUploadsPath)) {
            console.log('Création du dossier uploads...');
            fs.mkdirSync(targetUploadsPath, { recursive: true });
        }

        // Clean the uploads directory to avoid old files
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
            console.log(`${existingFiles.length} fichiers supprimés.`);
        }

        // Extract uploads files one by one for better control
        console.log('Extraction des fichiers uploads...');
        let extractedCount = 0;

        uploadEntries.forEach(entry => {
            if (!entry.isDirectory) {
                try {
                    // Extract to the uploads directory directly
                    // entry.entryName is like "uploads/filename.png"
                    // We want to extract to targetUploadsPath/filename.png
                    const fileName = path.basename(entry.entryName);
                    const targetPath = path.join(targetUploadsPath, fileName);

                    // Extract the file
                    const fileContent = zip.readFile(entry);
                    fs.writeFileSync(targetPath, fileContent);
                    extractedCount++;

                    if (extractedCount <= 3) {
                        console.log(`  ✓ ${fileName} (${(entry.header.size / 1024).toFixed(2)} KB)`);
                    }
                } catch (err) {
                    console.error(`  ✗ Erreur extraction ${entry.entryName}:`, err.message);
                }
            }
        });

        console.log(`${extractedCount} fichiers extraits dans uploads.`);

        // Verify extraction
        if (fs.existsSync(targetUploadsPath)) {
            const extractedFiles = fs.readdirSync(targetUploadsPath);
            console.log(`Vérification: ${extractedFiles.length} fichiers présents dans ${targetUploadsPath}`);
            if (extractedFiles.length > 0) {
                console.log('Exemples:', extractedFiles.slice(0, 3).join(', ') + (extractedFiles.length > 3 ? '...' : ''));
            }
        } else {
            console.error('ERREUR: Le dossier uploads n\'existe pas après extraction!');
        }


        res.json({ success: true, message: 'Restore successful. Please restart the application.' });

    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    } finally {
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        // Since we closed the DB, the server is now in a zombie state regarding DB ops.
        // It's best to exit the process so the process manager (or dev mode) restarts it, 
        // OR rely on the user restarting the Electron app.
        // In dev mode "npm run dev", killing node process stops it.
        // In production electron, we might want to trigger an app relaunch.

        // Let's exit after a short delay to allow response to send
        setTimeout(() => {
            console.log('Restarting server after restore...');
            process.exit(0); // This will kill the server, expecting Electron or PM2 to restart or user to reopen.
        }, 1000);
    }
});

module.exports = router;
