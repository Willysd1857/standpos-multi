const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get all stock movements
router.get('/', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        let query = supabase
            .from('stock_movements')
            .select('*');
            
        if (user.location_id) {
            query = query.eq('location_id', user.location_id);
        }
            
        const { data: movements, error } = await query
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        res.json(movements || []);
    } catch (error) {
        console.error('❌ Erreur GET /stock:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create stock movement
router.post('/', async (req, res) => {
    try {
        const id = uuidv4();
        const user = getUserFromRequest(req);
        const {
            product_id,
            product_name,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            transaction_ref,
            notes
        } = req.body;

        const { data: movement, error } = await supabase
            .from('stock_movements')
            .insert({
                id,
                product_id: product_id || null,
                location_id: user.location_id || null,
                product_name,
                movement_type,
                quantity: Number(quantity),
                stock_before: Number(stock_before),
                stock_after: Number(stock_after),
                transaction_ref: transaction_ref || null,
                notes: notes || null
            })
            .select()
            .single();

        if (error) throw error;

        // Audit log
        createAuditLog(
            user.id,
            user.username,
            'STOCK_MOVEMENT',
            'stock',
            id,
            {
                product_name: movement.product_name,
                type: movement.movement_type,
                quantity: movement.quantity,
                stock_after: movement.stock_after,
                notes: movement.notes
            },
            null,
            user.location_id
        );

        res.status(201).json(movement);
    } catch (error) {
        console.error('❌ Erreur POST /stock:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
