const express = require('express');
const router = express.Router();
const { db } = require('../database');

// Get settings
router.get('/', (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('default');
        res.json(settings || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings
router.put('/', (req, res) => {
    try {
        const updates = req.body;

        const fields = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => `${key} = ?`)
            .join(', ');

        const values = Object.keys(updates)
            .filter(key => key !== 'id' && key !== 'created_at')
            .map(key => updates[key]);

        values.push('default');

        const stmt = db.prepare(`
      UPDATE settings
      SET ${fields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(...values);

        const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('default');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
