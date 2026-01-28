const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all categories
router.get('/', (req, res) => {
    try {
        const categories = db.prepare('SELECT * FROM categories ORDER BY `order`, name').all();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category by ID
router.get('/:id', (req, res) => {
    try {
        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create category
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
        const {
            name,
            icon = 'default',
            color = '#2563eb',
            order = 0
        } = req.body;

        const stmt = db.prepare(`
      INSERT INTO categories (id, name, icon, color, \`order\`)
      VALUES (?, ?, ?, ?, ?)
    `);

        stmt.run(id, name, icon, color, order);

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update category
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const fields = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => key === 'order' ? '`order` = ?' : `${key} = ?`)
            .join(', ');

        const values = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => updates[key]);

        values.push(id);

        const stmt = db.prepare(`
      UPDATE categories
      SET ${fields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(...values);

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete category
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
