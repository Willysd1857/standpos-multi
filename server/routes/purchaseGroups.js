const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all purchase groups
router.get('/', (req, res) => {
    try {
        const groups = db.prepare(`
            SELECT * FROM purchase_groups 
            ORDER BY created_at DESC
        `).all();

        // Get items for each group
        const groupsWithItems = groups.map(group => {
            const items = db.prepare(`
                SELECT * FROM purchase_group_items 
                WHERE group_id = ?
            `).all(group.id);

            return {
                ...group,
                items
            };
        });

        res.json(groupsWithItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get purchase group by ID
router.get('/:id', (req, res) => {
    try {
        const group = db.prepare('SELECT * FROM purchase_groups WHERE id = ?').get(req.params.id);
        if (!group) {
            return res.status(404).json({ error: 'Purchase group not found' });
        }

        const items = db.prepare(`
            SELECT * FROM purchase_group_items 
            WHERE group_id = ?
        `).all(group.id);

        res.json({ ...group, items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create purchase group
router.post('/', (req, res) => {
    try {
        const groupId = uuidv4();
        const {
            supplier_name = '',
            payment_method = 'cash',
            date,
            status = 'validated',
            notes = '',
            items
        } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Items are required' });
        }

        // Calculate total
        const total_amount = items.reduce((sum, item) => {
            return sum + (Number(item.quantity) * Number(item.unit_price));
        }, 0);

        // Generate reference: APRO-XXX-DDMMYYYY
        const today = new Date();
        const dateStr = today.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ''); // 27012026

        // Count today's purchase groups for sequential number
        const countResult = db.prepare(`
            SELECT COUNT(*) as count 
            FROM purchase_groups 
            WHERE date(created_at, 'localtime') = date('now', 'localtime')
        `).get();

        const sequentialNumber = (countResult.count + 1).toString().padStart(3, '0');
        const reference = `APRO-${sequentialNumber}-${dateStr}`;

        // Start transaction
        const createGroup = db.transaction(() => {
            // Insert group
            db.prepare(`
                INSERT INTO purchase_groups (id, reference, supplier_name, payment_method, date, status, total_amount, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(groupId, reference, supplier_name, payment_method, date, status, total_amount, notes);

            // Insert items and update stock
            for (const item of items) {
                const itemId = uuidv4();
                const itemTotal = Number(item.quantity) * Number(item.unit_price);

                // Insert item
                db.prepare(`
                    INSERT INTO purchase_group_items (id, group_id, product_id, product_name, quantity, unit_price, total)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(itemId, groupId, item.product_id, item.product_name, item.quantity, item.unit_price, itemTotal);

                // Update stock if status is validated and product_id exists
                if (status === 'validated' && item.product_id) {
                    const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.product_id);
                    if (product) {
                        const currentStock = Number(product.stock) || 0;
                        const qtyToAdd = Number(item.quantity);
                        const newStock = currentStock + qtyToAdd;

                        db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.product_id);

                        // Record stock movement
                        db.prepare(`
                            INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            uuidv4(),
                            item.product_id,
                            product.name,
                            'achat',
                            item.quantity,
                            product.stock,
                            newStock,
                            reference,
                            `Approvisionnement groupé: ${supplier_name || 'Fournisseur inconnu'}`
                        );
                    }
                }
            }
        });

        createGroup();

        // Fetch the created group with items
        const group = db.prepare('SELECT * FROM purchase_groups WHERE id = ?').get(groupId);
        const groupItems = db.prepare('SELECT * FROM purchase_group_items WHERE group_id = ?').all(groupId);

        res.status(201).json({ ...group, items: groupItems });
    } catch (error) {
        console.error('Error creating purchase group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete purchase group
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        const group = db.prepare('SELECT * FROM purchase_groups WHERE id = ?').get(id);
        if (!group) {
            return res.status(404).json({ error: 'Purchase group not found' });
        }

        const items = db.prepare('SELECT * FROM purchase_group_items WHERE group_id = ?').all(id);

        // Start transaction to reverse stock changes
        const deleteGroup = db.transaction(() => {
            // Reverse stock if status was validated
            if (group.status === 'validated') {
                for (const item of items) {
                    if (item.product_id) {
                        const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.product_id);
                        if (product) {
                            const newStock = product.stock - item.quantity;
                            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.product_id);

                            // Record stock movement
                            db.prepare(`
                                INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(
                                uuidv4(),
                                item.product_id,
                                product.name,
                                'annulation',
                                -item.quantity,
                                product.stock,
                                newStock,
                                group.reference,
                                `Annulation approvisionnement groupé`
                            );
                        }
                    }
                }
            }

            // Delete group (items will be deleted by CASCADE)
            db.prepare('DELETE FROM purchase_groups WHERE id = ?').run(id);
        });

        deleteGroup();

        res.json({ message: 'Purchase group deleted successfully' });
    } catch (error) {
        console.error('Error deleting purchase group:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
