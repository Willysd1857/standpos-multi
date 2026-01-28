const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all products
router.get('/', (req, res) => {
    try {
        const { is_active } = req.query;
        let query = 'SELECT * FROM products';
        const params = [];

        if (is_active !== undefined) {
            query += ' WHERE is_active = ?';
            params.push(is_active === 'true' ? 1 : 0);
        }

        query += ' ORDER BY name';
        const products = db.prepare(query).all(...params);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get product by ID
router.get('/:id', (req, res) => {
    try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create product
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
        const {
            name,
            category_id,
            price,
            cost_price = 0,
            stock = 0,
            min_stock = 5,
            image_url = '',
            is_active = true,
            is_ingredient = false,
            unit = 'pièces'
        } = req.body;

        const stmt = db.prepare(`
      INSERT INTO products (id, name, category_id, price, cost_price, stock, min_stock, image_url, is_active, is_ingredient, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(id, name, category_id, price, cost_price, stock, min_stock, image_url, is_active ? 1 : 0, is_ingredient ? 1 : 0, unit);

        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update product
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Convert boolean fields to integer for SQLite
        if ('is_active' in updates) {
            updates.is_active = updates.is_active ? 1 : 0;
        }
        if ('is_ingredient' in updates) {
            updates.is_ingredient = updates.is_ingredient ? 1 : 0;
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
      UPDATE products
      SET ${fields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(...values);

        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete product
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM products WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
