const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get all purchases
router.get('/', async (req, res) => {
    try {
        const { start_date, end_date, product_id } = req.query;
        let query = supabase.from('purchases').select('*');

        if (start_date && end_date) {
            query = query.gte('date', start_date).lte('date', end_date);
        }

        if (product_id) {
            query = query.eq('product_id', product_id);
        }

        const { data: purchases, error } = await query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        res.json(purchases || []);
    } catch (error) {
        console.error('❌ Erreur GET /purchases:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get purchase by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: purchase, error } = await supabase
            .from('purchases')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        res.json(purchase);
    } catch (error) {
        console.error(`❌ Erreur GET /purchases/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Create purchase
router.post('/', async (req, res) => {
    try {
        const id = uuidv4();
        const {
            product_id,
            product_name,
            quantity,
            unit_price,
            supplier_name = '',
            payment_method = 'cash',
            date,
            notes = '',
            status = 'validated'
        } = req.body;

        const total_amount = Number(quantity) * Number(unit_price);

        // Fetch unit from product
        let finalUnit = '';
        if (product_id) {
            const { data: prod } = await supabase
                .from('products')
                .select('unit')
                .eq('id', product_id)
                .maybeSingle();
            finalUnit = prod?.unit || '';
        }

        // Insert purchase record
        const { data: purchase, error: insertError } = await supabase
            .from('purchases')
            .insert({
                id,
                product_id: product_id || null,
                product_name,
                unit: finalUnit || null,
                quantity: Number(quantity),
                unit_price: Number(unit_price),
                total_amount,
                supplier_name,
                payment_method,
                date,
                notes: notes || null,
                status
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Update product stock if product_id is provided AND status is validated
        if (product_id && status === 'validated') {
            const { data: product } = await supabase
                .from('products')
                .select('stock, name')
                .eq('id', product_id)
                .maybeSingle();

            if (product) {
                const currentStock = Number(product.stock) || 0;
                const qtyToAdd = Number(quantity);
                const newStock = currentStock + qtyToAdd;

                await supabase
                    .from('products')
                    .update({ stock: newStock })
                    .eq('id', product_id);

                // Record stock movement
                await supabase
                    .from('stock_movements')
                    .insert({
                        id: uuidv4(),
                        product_id,
                        product_name: product.name,
                        movement_type: 'achat',
                        quantity: qtyToAdd,
                        stock_before: currentStock,
                        stock_after: newStock,
                        notes: `Achat: ${supplier_name || 'Fournisseur inconnu'}`
                    });
            }
        }

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'CREATE_PURCHASE',
            'purchase',
            id,
            {
                product_name: purchase.product_name,
                quantity: purchase.quantity,
                total_amount: purchase.total_amount,
                supplier_name: purchase.supplier_name
            }
        );

        res.status(201).json(purchase);
    } catch (error) {
        console.error('❌ Erreur POST /purchases:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update purchase
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Fetch current purchase
        const { data: currentPurchase, error: fetchError } = await supabase
            .from('purchases')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!currentPurchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        const updates = { ...req.body };

        // Recalculate total if quantity or unit_price changed
        if ('quantity' in updates || 'unit_price' in updates) {
            const newQuantity = updates.quantity !== undefined ? updates.quantity : currentPurchase.quantity;
            const newUnitPrice = updates.unit_price !== undefined ? updates.unit_price : currentPurchase.unit_price;
            updates.total_amount = Number(newQuantity) * Number(newUnitPrice);
        }

        // Sanitize updates
        if (updates.id) delete updates.id;
        if (updates.created_at) delete updates.created_at;
        if (updates.updated_at) delete updates.updated_at;

        updates.updated_at = new Date().toISOString();

        const { data: purchase, error: updateError } = await supabase
            .from('purchases')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'UPDATE_PURCHASE',
            'purchase',
            id,
            {
                product_name: purchase.product_name,
                updated_fields: Object.keys(updates)
            }
        );

        res.json(purchase);
    } catch (error) {
        console.error(`❌ Erreur PUT /purchases/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Delete purchase
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression de l'achat: ${id}`);

        // Fetch current purchase
        const { data: purchase, error: fetchError } = await supabase
            .from('purchases')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!purchase) {
            console.warn(`[Delete] Achat non trouvé: ${id}`);
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Reverse stock if product_id exists
        if (purchase.product_id && purchase.status === 'validated') {
            const { data: product } = await supabase
                .from('products')
                .select('stock, name')
                .eq('id', purchase.product_id)
                .maybeSingle();

            if (product) {
                const currentStock = Number(product.stock) || 0;
                const qtyToSub = Number(purchase.quantity);
                const newStock = currentStock - qtyToSub;

                await supabase
                    .from('products')
                    .update({ stock: newStock })
                    .eq('id', purchase.product_id);

                // Record stock movement (reverse)
                await supabase
                    .from('stock_movements')
                    .insert({
                        id: uuidv4(),
                        product_id: purchase.product_id,
                        product_name: product.name,
                        movement_type: 'annulation',
                        quantity: -qtyToSub,
                        stock_before: currentStock,
                        stock_after: newStock,
                        notes: `Annulation achat du ${purchase.date}`
                    });
            }
        }

        // Delete purchase
        const { error: deleteError } = await supabase
            .from('purchases')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_PURCHASE',
            'purchase',
            id,
            {
                product_name: purchase.product_name,
                quantity: purchase.quantity,
                total_amount: purchase.total_amount
            }
        );

        console.log(`[Delete] Achat ${id} supprimé avec succès (stock restauré)`);
        res.json({ message: 'Purchase deleted successfully', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /purchases/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get purchase statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = supabase.from('purchases').select('total_amount, quantity, product_name');

        if (start_date && end_date) {
            query = query.gte('date', start_date).lte('date', end_date);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        let totalPurchases = 0;
        let purchaseCount = 0;
        const productMap = {};

        if (rows) {
            purchaseCount = rows.length;
            rows.forEach(r => {
                totalPurchases += Number(r.total_amount) || 0;
                const name = r.product_name || 'Inconnu';
                if (!productMap[name]) {
                    productMap[name] = { total_quantity: 0, total_amount: 0 };
                }
                productMap[name].total_quantity += Number(r.quantity) || 0;
                productMap[name].total_amount += Number(r.total_amount) || 0;
            });
        }

        const byProduct = Object.keys(productMap).map(name => ({
            product_name: name,
            total_quantity: productMap[name].total_quantity,
            total_amount: productMap[name].total_amount
        })).sort((a, b) => b.total_amount - a.total_amount).slice(0, 10);

        res.json({
            totalPurchases,
            purchaseCount,
            byProduct
        });
    } catch (error) {
        console.error('❌ Erreur GET /purchases/stats/summary:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
