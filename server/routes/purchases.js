const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all purchases
router.get('/', (req, res) => {
    try {
        const { start_date, end_date, product_id } = req.query;
        let query = 'SELECT * FROM purchases';
        const params = [];
        const conditions = [];

        if (start_date && end_date) {
            conditions.push('date BETWEEN ? AND ?');
            params.push(start_date, end_date);
        }

        if (product_id) {
            conditions.push('product_id = ?');
            params.push(product_id);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY date DESC, created_at DESC';
        const purchases = db.prepare(query).all(...params);
        res.json(purchases);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get purchase by ID
router.get('/:id', (req, res) => {
    try {
        const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        res.json(purchase);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create purchase
router.post('/', (req, res) => {
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

        const total_amount = quantity * unit_price;

        // Start transaction
        const createPurchase = db.transaction(() => {
            // Insert purchase record
            const stmt = db.prepare(`
                INSERT INTO purchases (id, product_id, product_name, quantity, unit_price, total_amount, supplier_name, payment_method, date, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(id, product_id, product_name, quantity, unit_price, total_amount, supplier_name, payment_method, date, notes, status);

            // Update product stock if product_id is provided AND status is validated
            if (product_id && status === 'validated') {
                const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(product_id);
                if (product) {
                    const currentStock = Number(product.stock) || 0;
                    const qtyToAdd = Number(quantity);
                    const newStock = currentStock + qtyToAdd;

                    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, product_id);

                    // Record stock movement
                    db.prepare(`
                        INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(),
                        product_id,
                        product.name,
                        'achat',
                        quantity,
                        product.stock,
                        newStock,
                        `Achat: ${supplier_name || 'Fournisseur inconnu'}`
                    );
                }
            }
        });

        createPurchase();

        const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
        res.status(201).json(purchase);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update purchase
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const currentPurchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);

        if (!currentPurchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        const updates = req.body;

        // Recalculate total if quantity or unit_price changed
        if ('quantity' in updates || 'unit_price' in updates) {
            const newQuantity = updates.quantity !== undefined ? updates.quantity : currentPurchase.quantity;
            const newUnitPrice = updates.unit_price !== undefined ? updates.unit_price : currentPurchase.unit_price;
            updates.total_amount = newQuantity * newUnitPrice;
        }

        const fields = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => `${key} = ?`)
            .join(', ');

        const values = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => updates[key]);

        values.push(id);

        const stmt = db.prepare(`
            UPDATE purchases
            SET ${fields}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(...values);

        const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
        res.json(purchase);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete purchase
router.delete('/:id', (req, res) => {
    try {
        const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Start transaction to reverse stock changes
        const deletePurchase = db.transaction(() => {
            // Reverse stock if product_id exists
            if (purchase.product_id) {
                const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(purchase.product_id);
                if (product) {
                    const newStock = product.stock - purchase.quantity;
                    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, purchase.product_id);

                    // Record stock movement
                    db.prepare(`
                        INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(),
                        purchase.product_id,
                        product.name,
                        'annulation',
                        -purchase.quantity,
                        product.stock,
                        newStock,
                        `Annulation achat du ${purchase.date}`
                    );
                }
            }

            // Delete purchase
            db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
        });

        deletePurchase();

        res.json({ message: 'Purchase deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get purchase statistics
router.get('/stats/summary', (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let whereClause = '';
        const params = [];

        if (start_date && end_date) {
            whereClause = ' WHERE date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }

        const totalPurchases = db.prepare(`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM purchases${whereClause}
        `).get(...params);

        const purchaseCount = db.prepare(`
            SELECT COUNT(*) as count
            FROM purchases${whereClause}
        `).get(...params);

        const byProduct = db.prepare(`
            SELECT product_name, SUM(quantity) as total_quantity, SUM(total_amount) as total_amount
            FROM purchases${whereClause}
            GROUP BY product_name
            ORDER BY total_amount DESC
            LIMIT 10
        `).all(...params);

        res.json({
            totalPurchases: totalPurchases.total,
            purchaseCount: purchaseCount.count,
            byProduct
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
