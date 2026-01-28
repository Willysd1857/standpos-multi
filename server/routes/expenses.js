const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all expenses
router.get('/', (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = 'SELECT * FROM expenses';
        const params = [];

        if (start_date && end_date) {
            query += ' WHERE date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }

        query += ' ORDER BY date DESC, created_at DESC';
        const expenses = db.prepare(query).all(...params);
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get expense by ID
router.get('/:id', (req, res) => {
    try {
        const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create expense
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
        const {
            description,
            amount,
            category = '',
            payment_method = 'cash',
            date,
            notes = ''
        } = req.body;

        const stmt = db.prepare(`
      INSERT INTO expenses (id, description, amount, category, payment_method, date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(id, description, amount, category, payment_method, date, notes);

        const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update expense
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const fields = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => `${key} = ?`)
            .join(', ');

        const values = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => updates[key]);

        values.push(id);

        const stmt = db.prepare(`
      UPDATE expenses
      SET ${fields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(...values);

        const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete expense
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.json({ message: 'Expense deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get expense statistics
router.get('/stats/summary', (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let whereClause = '';
        const params = [];

        if (start_date && end_date) {
            whereClause = ' WHERE date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }

        const totalExpenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses${whereClause}
    `).get(...params);

        const expenseCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM expenses${whereClause}
    `).get(...params);

        const byCategory = db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses${whereClause}
      GROUP BY category
    `).all(...params);

        res.json({
            totalExpenses: totalExpenses.total,
            expenseCount: expenseCount.count,
            byCategory
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
