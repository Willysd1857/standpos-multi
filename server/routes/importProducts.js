const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Multer - stockage temporaire en mémoire
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('Seuls les fichiers Excel (.xlsx, .xls) sont acceptés.'));
        }
        cb(null, true);
    }
});

// GET /api/products/import/template
// Génère et télécharge un fichier Excel modèle
router.get('/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();

        // En-têtes et ligne d'exemple
        const data = [
            [
                'nom',
                'prix_vente',
                'prix_achat',
                'stock',
                'stock_minimum',
                'unite',
                'categorie',
                'type_produit',
                'actif'
            ],
            [
                'Exemple Produit',
                1500,
                800,
                50,
                5,
                'pièces',
                'Ma Catégorie',
                'direct',
                'OUI'
            ]
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Largeur des colonnes
        ws['!cols'] = [
            { wch: 25 }, // nom
            { wch: 14 }, // prix_vente
            { wch: 14 }, // prix_achat
            { wch: 10 }, // stock
            { wch: 16 }, // stock_minimum
            { wch: 12 }, // unite
            { wch: 20 }, // categorie
            { wch: 16 }, // type_produit
            { wch: 10 }, // actif
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Produits');

        // Feuille d'instructions
        const infoData = [
            ['INSTRUCTIONS D\'IMPORT'],
            [''],
            ['Colonne', 'Obligatoire', 'Description', 'Valeurs acceptées'],
            ['nom', 'OUI', 'Nom du produit (doit être unique)', ''],
            ['prix_vente', 'OUI', 'Prix de vente (nombre positif)', 'Ex: 1500'],
            ['prix_achat', 'non', 'Prix de revient / coût', 'Ex: 800'],
            ['stock', 'non', 'Quantité initiale en stock', 'Entier, défaut: 0'],
            ['stock_minimum', 'non', 'Seuil d\'alerte stock bas', 'Entier, défaut: 5'],
            ['unite', 'non', 'Unité de mesure', 'pièces, kg, L, etc.'],
            ['categorie', 'non', 'Nom exact d\'une catégorie existante', ''],
            ['type_produit', 'non', 'Type de produit', 'direct / raw_material / recipe'],
            ['actif', 'non', 'Produit actif ou non', 'OUI (défaut) ou NON'],
            [''],
            ['NOTES :'],
            ['- Les produits dont le nom existe déjà seront ignorés (pas de mise à jour).'],
            ['- La colonne "categorie" doit correspondre à une catégorie déjà créée dans l\'application.'],
            ['- Si la catégorie est absente ou introuvable, le produit sera créé sans catégorie.'],
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 50 }, { wch: 35 }];
        XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="modele_import_produits.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Erreur génération modèle Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/products/import
// Importe les produits depuis un fichier Excel
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier fourni.' });
        }

        // Parse du fichier Excel
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows || rows.length === 0) {
            return res.status(400).json({ error: 'Le fichier est vide ou ne contient aucune donnée.' });
        }

        // Charger catégories existantes
        const { data: categories, error: catErr } = await supabase
            .from('categories')
            .select('id, name');

        if (catErr) throw catErr;

        // Charger produits existants
        const { data: prods, error: prodErr } = await supabase
            .from('products')
            .select('name');

        if (prodErr) throw prodErr;

        const existingProducts = (prods || []).map(p => p.name.toLowerCase().trim());

        const added = [];
        const skipped = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const lineNum = i + 2; // ligne Excel (1 = en-tête)

            try {
                // ── Validation ──────────────────────────────────────────
                const name = String(row['nom'] || '').trim();
                if (!name) {
                    errors.push({ ligne: lineNum, erreur: 'La colonne "nom" est vide.' });
                    continue;
                }

                const priceRaw = row['prix_vente'];
                const price = parseFloat(priceRaw);
                if (isNaN(price) || price < 0) {
                    errors.push({ ligne: lineNum, nom: name, erreur: 'La colonne "prix_vente" est manquante ou invalide.' });
                    continue;
                }

                // ── Doublon ─────────────────────────────────────────────
                if (existingProducts.includes(name.toLowerCase())) {
                    skipped.push({ ligne: lineNum, nom: name, raison: 'Produit déjà existant (ignoré).' });
                    continue;
                }

                // ── Résolution catégorie ─────────────────────────────────
                const categoryName = String(row['categorie'] || '').trim();
                let category_id = null;
                if (categoryName && categories) {
                    const found = categories.find(c =>
                        c.name.toLowerCase().trim() === categoryName.toLowerCase()
                    );
                    category_id = found ? found.id : null;
                }

                // ── Champs optionnels ────────────────────────────────────
                const cost_price = parseFloat(row['prix_achat']) || 0;
                const stock = parseInt(row['stock']) || 0;
                const min_stock = parseInt(row['stock_minimum']) || 5;
                const unit = String(row['unite'] || 'pièces').trim() || 'pièces';
                const actifRaw = String(row['actif'] || 'OUI').trim().toUpperCase();
                const is_active = !(actifRaw === 'NON' || actifRaw === '0' || actifRaw === 'FALSE');

                const typeRaw = String(row['type_produit'] || 'direct').trim().toLowerCase();
                const validTypes = ['direct', 'raw_material', 'recipe'];
                const product_type = validTypes.includes(typeRaw) ? typeRaw : 'direct';
                const is_ingredient = product_type === 'raw_material';

                // ── Insertion ────────────────────────────────────────────
                const newId = uuidv4();
                const { error: insertErr } = await supabase
                    .from('products')
                    .insert({
                        id: newId,
                        name,
                        category_id: category_id || null,
                        price,
                        cost_price,
                        stock,
                        min_stock,
                        is_active,
                        unit,
                        track_stock: true,
                        product_type,
                        is_ingredient
                    });

                if (insertErr) throw insertErr;

                // Ajouter à la liste des existants pour éviter les doublons intra-fichier
                existingProducts.push(name.toLowerCase());
                added.push({ ligne: lineNum, nom: name });

            } catch (rowError) {
                errors.push({ ligne: lineNum, erreur: rowError.message });
            }
        }

        // Audit log
        try {
            const user = getUserFromRequest(req);
            createAuditLog(
                user.id, user.username,
                'IMPORT_PRODUCTS_EXCEL', 'product', 'bulk',
                { added: added.length, skipped: skipped.length, errors: errors.length }
            );
        } catch (_) { /* facultatif */ }

        res.json({
            success: true,
            total: rows.length,
            added: added.length,
            skipped: skipped.length,
            errorCount: errors.length,
            details: { added, skipped, errors }
        });

    } catch (error) {
        console.error('Erreur import Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
