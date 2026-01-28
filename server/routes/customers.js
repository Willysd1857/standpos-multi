const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Generate customer ID: NOM-TELEPHONE
function generateCustomerId(name, phone) {
    const cleanName = name.toUpperCase().replace(/\s+/g, '');
    const cleanPhone = phone.replace(/\s+/g, '');
    return `${cleanName}-${cleanPhone}`;
}

// Create or get customer
router.post('/', (req, res) => {
    try {
        const { name, phone_number } = req.body;

        if (!name || !phone_number) {
            return res.status(400).json({ error: 'Nom et téléphone requis' });
        }

        const customerId = generateCustomerId(name, phone_number);

        // Check if customer exists
        let customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);

        if (!customer) {
            // Create new customer
            const id = uuidv4();
            db.prepare(`
                INSERT INTO customers (id, customer_id, name, phone_number, first_transaction_date, unpaid_count, is_blocked)
                VALUES (?, ?, ?, ?, datetime('now'), 0, 0)
            `).run(id, customerId, name, phone_number);

            customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
        }

        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get customer by customer_id
router.get('/:customer_id', (req, res) => {
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.customer_id);

        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unpaid count for a customer
router.get('/:customer_id/unpaid-count', (req, res) => {
    try {
        const customer = db.prepare('SELECT unpaid_count, is_blocked FROM customers WHERE customer_id = ?').get(req.params.customer_id);

        if (!customer) {
            return res.json({ unpaid_count: 0, is_blocked: false });
        }

        res.json({
            unpaid_count: customer.unpaid_count,
            is_blocked: customer.is_blocked === 1
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Increment unpaid count
router.post('/:customer_id/increment-unpaid', (req, res) => {
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.customer_id);

        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        const newCount = customer.unpaid_count + 1;
        const shouldBlock = newCount >= 3;

        db.prepare(`
            UPDATE customers 
            SET unpaid_count = ?, is_blocked = ?, updated_at = datetime('now')
            WHERE customer_id = ?
        `).run(newCount, shouldBlock ? 1 : 0, req.params.customer_id);

        res.json({
            unpaid_count: newCount,
            is_blocked: shouldBlock
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Decrement unpaid count (when payment is made)
router.post('/:customer_id/decrement-unpaid', (req, res) => {
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.customer_id);

        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        const newCount = Math.max(0, customer.unpaid_count - 1);
        const shouldUnblock = newCount < 3;

        db.prepare(`
            UPDATE customers 
            SET unpaid_count = ?, is_blocked = ?, updated_at = datetime('now')
            WHERE customer_id = ?
        `).run(newCount, shouldUnblock ? 0 : customer.is_blocked, req.params.customer_id);

        res.json({
            unpaid_count: newCount,
            is_blocked: customer.is_blocked === 1 && !shouldUnblock
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all customers
router.get('/', (req, res) => {
    try {
        const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
