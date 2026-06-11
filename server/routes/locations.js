const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Middleware d'autorisation (seuls les admins peuvent modifier les emplacements)
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';

const requireAdminLocal = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Auth for adjust-packaging: allow admin OR stock_manager at this specific location
const requireAuthForPackagingAdjust = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
        const locationId = req.params.id;
        const isAdmin = decoded.role === 'admin';
        const isManagerAtLocation = (decoded.role === 'stock_manager' || decoded.role === 'store_manager') && decoded.location_id === locationId;
        if (!isAdmin && !isManagerAtLocation) {
            return res.status(403).json({ error: 'Accès non autorisé pour cet emplacement.' });
        }
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Obtenir tous les emplacements
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('locations')
            .select('*, users(id, username)')
            .order('name');

        if (error) throw error;

        // Calculer le total des emballages vides par emplacement depuis stock_by_location
        const { data: stockRows, error: stockErr } = await supabase
            .from('stock_by_location')
            .select('location_id, empty_packaging_qty, empty_secondary_packaging_qty');

        if (stockErr) {
            console.error('⚠️ Erreur lecture stock_by_location:', stockErr.message);
        }

        const totalsByLocation = {};
        for (const row of (stockRows || [])) {
            if (!totalsByLocation[row.location_id]) {
                totalsByLocation[row.location_id] = { empty_bottles: 0, empty_crates: 0 };
            }
            totalsByLocation[row.location_id].empty_bottles += Number(row.empty_packaging_qty) || 0;
            totalsByLocation[row.location_id].empty_crates += Number(row.empty_secondary_packaging_qty) || 0;
        }

        const enriched = (data || []).map(loc => ({
            ...loc,
            packaging_stock: totalsByLocation[loc.id] || { empty_bottles: 0, empty_crates: 0 }
        }));

        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtenir le détail des stocks d'emballages par produit pour un emplacement
router.get('/:id/packaging-stock', async (req, res) => {
    try {
        const locationId = req.params.id;

        // Vérifier que l'emplacement existe
        const { data: loc, error: locErr } = await supabase
            .from('locations')
            .select('id, name, type')
            .eq('id', locationId)
            .maybeSingle();
        if (locErr) throw locErr;
        if (!loc) return res.status(404).json({ error: 'Emplacement introuvable' });

        // Récupérer les lignes stock_by_location avec les produits liés
        const { data: stockRows, error: stockErr } = await supabase
            .from('stock_by_location')
            .select('id, product_id, quantity, empty_packaging_qty, empty_secondary_packaging_qty')
            .eq('location_id', locationId);

        if (stockErr) throw stockErr;

        const productIds = (stockRows || []).map(r => r.product_id).filter(Boolean);

        // Fetch ALL products (not just has_packaging=true) so we never miss products
        // that have packaging stock but haven't had the has_packaging flag set yet.
        const { data: allProducts, error: pkgErr } = await supabase
            .from('products')
            .select('id, name, unit, has_packaging, bottle_deposit_price, crate_deposit_price, packaging_type_id, secondary_packaging_type_id');
        if (pkgErr) {
            console.error('[PackagingStock] Error fetching products:', pkgErr.message);
            throw pkgErr;
        }

        // Build products map: merge stock rows with all products
        let productsMap = {};
        const allProductIds = new Set([...productIds, ...(allProducts || []).map(p => p.id)]);
        for (const p of (allProducts || [])) productsMap[p.id] = p;

        // Build a map of existing stock_by_location rows
        const stockMap = {};
        for (const r of (stockRows || [])) stockMap[r.product_id] = r;

        const items = [...allProductIds]
            .map(productId => {
                const p = productsMap[productId] || {};
                const r = stockMap[productId];
                return {
                    stock_id: r?.id || null,
                    product_id: productId,
                    product_name: p.name || 'Produit inconnu',
                    unit: p.unit || '',
                    has_packaging: p.has_packaging || false,
                    quantity: Number(r?.quantity) || 0,
                    empty_packaging_qty: Number(r?.empty_packaging_qty) || 0,
                    empty_secondary_packaging_qty: Number(r?.empty_secondary_packaging_qty) || 0,
                    bottle_deposit_price: p.bottle_deposit_price || 0,
                    crate_deposit_price: p.crate_deposit_price || 0,
                };
            })
            .filter(r => r.has_packaging || r.empty_packaging_qty > 0 || r.empty_secondary_packaging_qty > 0);

        const totals = items.reduce(
            (acc, r) => {
                acc.empty_bottles += r.empty_packaging_qty;
                acc.empty_crates += r.empty_secondary_packaging_qty;
                return acc;
            },
            { empty_bottles: 0, empty_crates: 0 }
        );

        res.json({ location: loc, items, totals });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtenir un seul emplacement
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('locations')
            .select('*, users(id, username)')
            .eq('id', req.params.id)
            .single();
            
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Créer un emplacement (Admin only)
router.post('/', requireAdminLocal, async (req, res) => {
    try {
        const { id, name, type, address, is_active, username, pin_code } = req.body;
        const { v4: uuidv4 } = require('uuid');
        
        const locId = id || uuidv4();
        
        const { data, error } = await supabase
            .from('locations')
            .insert([{ id: locId, name, type, address, is_active }])
            .select()
            .single();
            
        if (error) throw error;
        
        // Handle User creation if provided
        if (username && pin_code) {
            const role = type === 'store' ? 'store_manager' : 'stock_manager';
            const pin_code_hash = await bcrypt.hash(pin_code, 10);
            const { error: userError } = await supabase.from('users').insert([{
                id: `user-${locId}`,
                username,
                password_hash: 'not-used-anymore',
                full_name: `Responsable ${name}`,
                role,
                is_active: true,
                pin_code_hash,
                location_id: locId
            }]);
            
            if (userError) console.error("Error creating user for location:", userError);
        }
        
        createAuditLog(req.user.id, req.user.username, 'CREATE_LOCATION', 'location', locId, { name, type }, null, req.user.location_id);
        
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modifier un emplacement (Admin only)
router.put('/:id', requireAdminLocal, async (req, res) => {
    try {
        const { name, type, address, is_active, username, pin_code } = req.body;
        
        const { data, error } = await supabase
            .from('locations')
            .update({ name, type, address, is_active, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) throw error;
        
        // Handle User update/creation
        if (username) {
            // Check if user exists
            const { data: existingUser } = await supabase.from('users').select('id').eq('location_id', req.params.id).maybeSingle();
            
            let userUpdateData = { username };
            if (pin_code) {
                userUpdateData.pin_code_hash = await bcrypt.hash(pin_code, 10);
            }
            
            if (existingUser) {
                await supabase.from('users').update(userUpdateData).eq('id', existingUser.id);
            } else if (pin_code) {
                // Create user if they don't exist but username and pin are provided
                const role = type === 'store' ? 'store_manager' : 'stock_manager';
                const { v4: uuidv4 } = require('uuid');
                await supabase.from('users').insert([{
                    id: `user-${req.params.id}`,
                    username,
                    password_hash: 'not-used-anymore',
                    full_name: `Responsable ${name}`,
                    role,
                    is_active: true,
                    pin_code_hash: userUpdateData.pin_code_hash,
                    location_id: req.params.id
                }]);
            }
        }
        
        createAuditLog(req.user.id, req.user.username, 'UPDATE_LOCATION', 'location', req.params.id, { name, type, is_active }, null, req.user.location_id);
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un emplacement (Admin only)
router.delete('/:id', requireAdminLocal, async (req, res) => {
    try {
        const { error } = await supabase
            .from('locations')
            .delete()
            .eq('id', req.params.id);
            
        if (error) throw error;
        
        createAuditLog(req.user.id, req.user.username, 'DELETE_LOCATION', 'location', req.params.id, null, null, req.user.location_id);
        
        res.json({ message: 'Emplacement supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ajuster le stock d'emballages vides d'un emplacement (Admin ou responsable de l'emplacement)
router.post('/:id/adjust-packaging', requireAuthForPackagingAdjust, async (req, res) => {
    try {
        const locationId = req.params.id;
        const user = req.user;
        const { product_id, empty_packaging_qty, empty_secondary_packaging_qty, reason } = req.body;

        if (!product_id) {
            return res.status(400).json({ error: 'Produit requis' });
        }
        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ error: 'Une raison est obligatoire pour cet ajustement.' });
        }

        const newBottles = Number(empty_packaging_qty);
        const newCrates = Number(empty_secondary_packaging_qty);

        if (isNaN(newBottles) || newBottles < 0 || isNaN(newCrates) || newCrates < 0) {
            return res.status(400).json({ error: 'Quantités invalides (doivent être ≥ 0).' });
        }

        // Récupérer le produit
        const { data: product, error: prodErr } = await supabase
            .from('products')
            .select('id, name')
            .eq('id', product_id)
            .maybeSingle();
        if (prodErr) throw prodErr;
        if (!product) return res.status(404).json({ error: 'Produit introuvable' });

        // Récupérer l'emplacement
        const { data: loc, error: locErr } = await supabase
            .from('locations')
            .select('id, name, type')
            .eq('id', locationId)
            .maybeSingle();
        if (locErr) throw locErr;
        if (!loc) return res.status(404).json({ error: 'Emplacement introuvable' });

        // Récupérer la ligne stock_by_location existante (ou en créer une)
        const { data: existing, error: stockErr } = await supabase
            .from('stock_by_location')
            .select('*')
            .eq('location_id', locationId)
            .eq('product_id', product_id)
            .maybeSingle();
        if (stockErr) throw stockErr;

        const beforeBottles = Number(existing?.empty_packaging_qty) || 0;
        const beforeCrates = Number(existing?.empty_secondary_packaging_qty) || 0;

        if (existing) {
            const { error: updateErr } = await supabase
                .from('stock_by_location')
                .update({
                    empty_packaging_qty: newBottles,
                    empty_secondary_packaging_qty: newCrates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            if (updateErr) throw updateErr;
        } else {
            const { error: insertErr } = await supabase
                .from('stock_by_location')
                .insert([{
                    id: uuidv4(),
                    location_id: locationId,
                    product_id,
                    quantity: 0,
                    empty_packaging_qty: newBottles,
                    empty_secondary_packaging_qty: newCrates
                }]);
            if (insertErr) throw insertErr;
        }

        // Enregistrer le mouvement d'emballage pour traçabilité
        const movementId = uuidv4();
        const movementType = (newBottles < beforeBottles || newCrates < beforeCrates) ? 'breakage' : 'manual_adjustment';
        await supabase.from('packaging_movements').insert([{
            id: movementId,
            location_id: locationId,
            product_id,
            product_name: product.name,
            movement_type: movementType,
            empty_packaging_qty: newBottles - beforeBottles,
            empty_secondary_packaging_qty: newCrates - beforeCrates,
            source_type: 'manual',
            source_id: null,
            notes: `[Ajustement admin] ${reason.trim()}`,
            created_by: user.id
        }]);

        // Tracer en audit
        createAuditLog(
            user.id,
            user.username,
            'ADJUST_LOCATION_PACKAGING',
            'location',
            locationId,
            {
                location_name: loc.name,
                product_id,
                product_name: product.name,
                reason: reason.trim(),
                bottles_before: beforeBottles,
                bottles_after: newBottles,
                crates_before: beforeCrates,
                crates_after: newCrates,
                movement_id: movementId
            },
            null,
            user.location_id
        );

        res.json({
            success: true,
            product_id,
            bottles_before: beforeBottles,
            bottles_after: newBottles,
            crates_before: beforeCrates,
            crates_after: newCrates
        });
    } catch (error) {
        console.error('❌ Erreur POST /locations/:id/adjust-packaging:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
