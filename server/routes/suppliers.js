const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Middleware d'authentification basique
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Obtenir tous les fournisseurs
router.get('/', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .order('name');
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtenir un fournisseur spécifique avec ses transactions
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { data: supplier, error: suppErr } = await supabase
            .from('suppliers')
            .select('*')
            .eq('id', req.params.id)
            .single();
            
        if (suppErr) throw suppErr;
        
        // Obtenir l'historique des transactions
        const { data: transactions, error: transErr } = await supabase
            .from('supplier_transactions')
            .select('*')
            .eq('supplier_id', req.params.id)
            .order('date', { ascending: false });
            
        if (transErr) throw transErr;
        
        res.json({ ...supplier, transactions: transactions || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un fournisseur
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, contact_info, phone } = req.body;
        const { v4: uuidv4 } = require('uuid');
        
        const id = uuidv4();
        
        const { data, error } = await supabase
            .from('suppliers')
            .insert([{ id, name, contact_info, phone, total_debt: 0, is_active: true }])
            .select()
            .single();
            
        if (error) throw error;
        
        createAuditLog(req.user.id, req.user.username, 'CREATE_SUPPLIER', 'supplier', id, { name }, null, req.user.location_id);
        
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modifier un fournisseur
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { name, contact_info, phone, is_active } = req.body;
        
        const { data, error } = await supabase
            .from('suppliers')
            .update({ name, contact_info, phone, is_active, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) throw error;
        
        createAuditLog(req.user.id, req.user.username, 'UPDATE_SUPPLIER', 'supplier', req.params.id, { name }, null, req.user.location_id);
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un paiement à un fournisseur
router.post('/:id/pay', requireAuth, async (req, res) => {
    try {
        const { amount, payment_method, notes } = req.body;
        const supplierId = req.params.id;
        const { v4: uuidv4 } = require('uuid');
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être supérieur à 0' });
        }
        
        // Obtenir la dette actuelle
        const { data: supplier, error: suppErr } = await supabase
            .from('suppliers')
            .select('total_debt')
            .eq('id', supplierId)
            .single();
            
        if (suppErr) throw suppErr;
        
        // Créer la transaction de paiement
        const transactionId = uuidv4();
        const { error: transErr } = await supabase
            .from('supplier_transactions')
            .insert([{
                id: transactionId,
                supplier_id: supplierId,
                location_id: req.user.location_id,
                type: 'payment',
                total_amount: amount,
                paid_amount: amount,
                debt_amount: 0,
                payment_method,
                date: new Date().toISOString().split('T')[0],
                notes
            }]);
            
        if (transErr) throw transErr;
        
        // Mettre à jour la dette totale du fournisseur
        const newDebt = Math.max(0, parseFloat(supplier.total_debt) - parseFloat(amount));
        const { data: updatedSupplier, error: updateErr } = await supabase
            .from('suppliers')
            .update({ total_debt: newDebt })
            .eq('id', supplierId)
            .select()
            .single();
            
        if (updateErr) throw updateErr;
        
        createAuditLog(req.user.id, req.user.username, 'SUPPLIER_PAYMENT', 'supplier', supplierId, { amount, newDebt }, null, req.user.location_id);
        
        res.json(updatedSupplier);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Retourner des emballages vides au fournisseur
router.post('/:id/return-packaging', requireAuth, async (req, res) => {
    try {
        const supplierId = req.params.id;
        const { product_id, empty_qty, empty_secondary_qty } = req.body;
        const locationId = req.user.location_id;
        const { v4: uuidv4 } = require('uuid');

        if (!locationId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Emplacement requis pour effectuer un retour.' });
        }

        // Vérifier le stock de consignes à cet emplacement
        const { data: stock } = await supabase.from('stock_by_location')
            .select('*')
            .eq('location_id', locationId)
            .eq('product_id', product_id)
            .single();

        if (!stock || stock.empty_packaging_qty < empty_qty || stock.empty_secondary_packaging_qty < empty_secondary_qty) {
            return res.status(400).json({ error: 'Stock d\'emballages vides insuffisant à cet emplacement.' });
        }

        // Obtenir les valeurs des consignes via le produit
        const { data: product } = await supabase.from('products')
            .select('packaging_type_id, secondary_packaging_type_id')
            .eq('id', product_id)
            .single();

        let totalRefundValue = 0;

        if (empty_qty > 0 && product.packaging_type_id) {
            const { data: pType } = await supabase.from('packaging_types').select('deposit_value').eq('id', product.packaging_type_id).single();
            totalRefundValue += (pType?.deposit_value || 0) * empty_qty;
        }

        if (empty_secondary_qty > 0 && product.secondary_packaging_type_id) {
            const { data: sType } = await supabase.from('packaging_types').select('deposit_value').eq('id', product.secondary_packaging_type_id).single();
            totalRefundValue += (sType?.deposit_value || 0) * empty_secondary_qty;
        }

        // Déduire du stock
        await supabase.from('stock_by_location')
            .update({
                empty_packaging_qty: stock.empty_packaging_qty - (empty_qty || 0),
                empty_secondary_packaging_qty: stock.empty_secondary_packaging_qty - (empty_secondary_qty || 0)
            })
            .eq('id', stock.id);

        // Déduire de la dette fournisseur
        const { data: supplier } = await supabase.from('suppliers').select('total_debt, outstanding_bottles, outstanding_crates').eq('id', supplierId).single();
        const newDebt = Math.max(0, parseFloat(supplier.total_debt) - totalRefundValue);
        const newOutstandingBottles = Math.max(0, (Number(supplier.outstanding_bottles) || 0) - (Number(empty_qty) || 0));
        const newOutstandingCrates = Math.max(0, (Number(supplier.outstanding_crates) || 0) - (Number(empty_secondary_qty) || 0));

        await supabase.from('suppliers').update({
            total_debt: newDebt,
            outstanding_bottles: newOutstandingBottles,
            outstanding_crates: newOutstandingCrates
        }).eq('id', supplierId);

        // Historique
        const transactionId = uuidv4();
        await supabase.from('supplier_transactions').insert([{
            id: transactionId,
            supplier_id: supplierId,
            location_id: locationId,
            type: 'packaging_return',
            total_amount: totalRefundValue,
            date: new Date().toISOString().split('T')[0],
            notes: `Retour emballages vides: ${empty_qty || 0} unit(s), ${empty_secondary_qty || 0} secondaire(s)`
        }]);

        createAuditLog(req.user.id, req.user.username, 'SUPPLIER_PACKAGING_RETURN', 'supplier', supplierId, { totalRefundValue, newDebt }, null, locationId);

        res.json({ success: true, refundValue: totalRefundValue, newDebt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
