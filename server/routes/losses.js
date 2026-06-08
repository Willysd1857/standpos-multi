const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { createAuditLog } = require('../middleware/auditLogger');
const { v4: uuidv4 } = require('uuid');

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(authHeader.substring(7), JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Obtenir toutes les pertes
router.get('/', requireAuth, async (req, res) => {
    try {
        let query = supabase
            .from('losses_and_damages')
            .select(`
                *,
                product:products(name),
                user:users!losses_and_damages_responsible_user_id_fkey(full_name),
                location:locations(name)
            `)
            .order('created_at', { ascending: false });

        if (req.user.role !== 'admin' && req.user.location_id) {
            query = query.eq('location_id', req.user.location_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Déclarer une perte ou casse
router.post('/', requireAuth, async (req, res) => {
    try {
        const { product_id, quantity, empty_packaging_qty, empty_secondary_packaging_qty, type, responsible_user_id, notes } = req.body;
        const location_id = req.user.location_id;
        
        if (!location_id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Emplacement requis' });
        }
        
        const actualLocationId = location_id || req.body.location_id; // Admin can specify
        
        if (!product_id || !type) {
            return res.status(400).json({ error: 'Produit et type (perte/casse) requis' });
        }

        // Calculer la valeur financière de la perte
        const { data: product } = await supabase.from('products').select('*').eq('id', product_id).single();
        let totalFinancialValue = 0;
        
        if (quantity > 0) totalFinancialValue += (product.price || 0) * quantity;
        
        if (empty_packaging_qty > 0 && product.packaging_type_id) {
            const { data: pType } = await supabase.from('packaging_types').select('deposit_value').eq('id', product.packaging_type_id).single();
            totalFinancialValue += (pType?.deposit_value || 0) * empty_packaging_qty;
        }

        if (empty_secondary_packaging_qty > 0 && product.secondary_packaging_type_id) {
            const { data: sType } = await supabase.from('packaging_types').select('deposit_value').eq('id', product.secondary_packaging_type_id).single();
            totalFinancialValue += (sType?.deposit_value || 0) * empty_secondary_packaging_qty;
        }

        // Enregistrer la perte
        const lossId = uuidv4();
        const { error: lossErr } = await supabase.from('losses_and_damages').insert([{
            id: lossId,
            location_id: actualLocationId,
            product_id,
            quantity: quantity || 0,
            empty_packaging_qty: empty_packaging_qty || 0,
            empty_secondary_packaging_qty: empty_secondary_packaging_qty || 0,
            type,
            responsible_user_id,
            financial_value: totalFinancialValue,
            is_reimbursed: false,
            notes,
            created_by: req.user.id
        }]);

        if (lossErr) throw lossErr;

        // Déduire du stock
        const { data: stock } = await supabase.from('stock_by_location')
            .select('*')
            .eq('location_id', actualLocationId)
            .eq('product_id', product_id)
            .single();

        if (stock) {
            await supabase.from('stock_by_location')
                .update({
                    quantity: Math.max(0, stock.quantity - (quantity || 0)),
                    empty_packaging_qty: Math.max(0, stock.empty_packaging_qty - (empty_packaging_qty || 0)),
                    empty_secondary_packaging_qty: Math.max(0, stock.empty_secondary_packaging_qty - (empty_secondary_packaging_qty || 0))
                })
                .eq('id', stock.id);
        }

        createAuditLog(req.user.id, req.user.username, 'REPORT_LOSS', 'loss', lossId, { totalFinancialValue }, null, actualLocationId);

        res.status(201).json({ success: true, lossId, totalFinancialValue });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Marquer une perte comme remboursée (le responsable a payé)
router.post('/:id/reimburse', requireAuth, async (req, res) => {
    try {
        const { error } = await supabase.from('losses_and_damages')
            .update({ is_reimbursed: true })
            .eq('id', req.params.id);

        if (error) throw error;
        
        createAuditLog(req.user.id, req.user.username, 'REIMBURSE_LOSS', 'loss', req.params.id, null, null, req.user.location_id);

        res.json({ success: true, message: 'Remboursement enregistré' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
