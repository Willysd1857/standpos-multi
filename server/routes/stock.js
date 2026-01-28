const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all stock movements
router.get('/', (req, res) => {
    try {
        const movements = db.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC').all();
        res.json(movements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create stock movement
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
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

        const stmt = db.prepare(`
      INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes);

        const movement = db.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id);
        res.status(201).json(movement);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
