const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all transactions
router.get('/', (req, res) => {
    try {
        const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
        // Parse items JSON for each transaction
        const parsedTransactions = transactions.map(t => ({
            ...t,
            items: JSON.parse(t.items),
            is_vip: Boolean(t.is_vip),
            created_date: t.created_at  // Map created_at to created_date for frontend compatibility
        }));
        res.json(parsedTransactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get transaction by ID
router.get('/:id', (req, res) => {
    try {
        const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        transaction.items = JSON.parse(transaction.items);
        transaction.is_vip = Boolean(transaction.is_vip);
        transaction.created_date = transaction.created_at;  // Map created_at to created_date
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create transaction
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
        const {
            reference,
            type,
            items,
            total_amount,
            payment_method,
            status = 'validated',
            partner_name,
            phone_number,
            transaction_ref,
            table_number,
            is_vip = false,
            amount_paid,
            amount_due,
            payment_status = 'paid',
            customer_id,
            customer_name
        } = req.body;

        // Generate new reference format: T{Table}-C{Customer}-{ddMMyyyy}
        // 1. Get today's count for customer number
        const today = new Date();
        const dateStr = today.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ''); // 07112025
        const queryDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

        // user local time might differ, better to rely on sqlite 'localtime' or similar, 
        // but consistent 'today' from server is fine for single machine.
        // We use 'like' to match the date part of created_at string
        const countResult = db.prepare(`
            SELECT COUNT(*) as count 
            FROM transactions 
            WHERE date(created_at, 'localtime') = date('now', 'localtime')
        `).get();

        const customerNumber = (countResult.count + 1).toString().padStart(3, '0');
        const finalTableNumber = table_number || 'T?'; // Default if missing

        // Format: T2-C001-07112025
        const finalReference = `${finalTableNumber}-C${customerNumber}-${dateStr}`;

        const stmt = db.prepare(`
      INSERT INTO transactions (id, reference, type, items, total_amount, payment_method, status, partner_name, phone_number, transaction_ref, table_number, is_vip, amount_paid, amount_due, payment_status, customer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            id,
            finalReference,
            type,
            JSON.stringify(items),
            total_amount,
            payment_method,
            status,
            partner_name,
            phone_number,
            transaction_ref || null,
            table_number,
            is_vip ? 1 : 0,
            amount_paid !== undefined ? amount_paid : total_amount,
            amount_due !== undefined ? amount_due : 0,
            payment_status,
            customer_id || null
        );

        // Handle customer credit if there's an unpaid amount
        if (customer_id && amount_due > 0) {
            // Check if customer exists
            let customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customer_id);

            if (!customer) {
                // Create new customer
                const customerId = uuidv4();
                db.prepare(`
                    INSERT INTO customers (id, customer_id, name, phone_number, first_transaction_date, unpaid_count, is_blocked)
                    VALUES (?, ?, ?, ?, datetime('now'), 1, 0)
                `).run(customerId, customer_id, customer_name || partner_name, phone_number);
            } else {
                // Increment unpaid count
                const newCount = customer.unpaid_count + 1;
                const shouldBlock = newCount >= 3;
                db.prepare(`
                    UPDATE customers 
                    SET unpaid_count = ?, is_blocked = ?, updated_at = datetime('now')
                    WHERE customer_id = ?
                `).run(newCount, shouldBlock ? 1 : 0, customer_id);
            }
        }

        // Deduct stock for validated transactions
        if (status === 'validated' && items && Array.isArray(items)) {
            for (const item of items) {
                if (!item || !item.product_id || !item.quantity) continue;

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
                        item.product_name || product.name,
                        'vente',
                        -item.quantity,
                        product.stock,
                        newStock,
                        finalReference,
                        `Vente ${finalReference}`
                    );
                }
            }
        }

        const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        transaction.items = JSON.parse(transaction.items);
        transaction.is_vip = Boolean(transaction.is_vip);
        transaction.created_date = transaction.created_at;  // Map created_at to created_date
        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update transaction details (items, total, etc.)
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const {
            items,
            total_amount,
            payment_method,
            status,
            partner_name,
            phone_number,
            transaction_ref,
            table_number,
            is_vip,
            amount_paid,
            amount_due,
            payment_status
        } = req.body;

        const currentTransaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!currentTransaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const oldItems = typeof currentTransaction.items === 'string' ? JSON.parse(currentTransaction.items) : currentTransaction.items;

        // Start transaction for atomicity
        const updateTransaction = db.transaction(() => {
            console.log(`Updating transaction ${id}, current status: ${currentTransaction.status}`);

            // Only update stock if items are provided in the request
            if (items) {
                // 1. Reverse old stock movements ONLY if transaction was previously validated
                // (pending transactions never had stock deducted)
                if (Array.isArray(oldItems) && currentTransaction.status === 'validated') {
                    for (const item of oldItems) {
                        if (item && item.product_id && item.quantity) {
                            db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
                        }
                    }
                }

                // 2. Apply new stock movements ONLY if the new status is validated
                const newStatus = status !== undefined ? status : currentTransaction.status;
                if (newStatus === 'validated') {
                    for (const item of items) {
                        if (!item || !item.product_id || !item.quantity) continue;

                        const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.product_id);
                        // Even if product not found (deleted?), we proceed if possible, but usually we need product
                        if (product) {
                            const newStock = product.stock - item.quantity;
                            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.product_id);

                            // Record movement
                            db.prepare(`
                                INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(
                                uuidv4(),
                                item.product_id,
                                item.product_name || product.name, // Fallback to product name
                                'modification',
                                -item.quantity,
                                product.stock,
                                newStock,
                                currentTransaction.reference,
                                `Modification commande ${currentTransaction.reference}`
                            );
                        }
                    }
                }
            }

            // 3. Update transaction record
            // Use provided values or fallback to current values
            const finalItems = items !== undefined ? JSON.stringify(items) : currentTransaction.items;
            const finalTotal = total_amount !== undefined ? total_amount : currentTransaction.total_amount;
            const finalPaymentMethod = payment_method !== undefined ? payment_method : currentTransaction.payment_method;
            const finalStatus = status !== undefined ? status : currentTransaction.status;
            const finalPartnerName = partner_name !== undefined ? partner_name : currentTransaction.partner_name;
            const finalPhoneNumber = phone_number !== undefined ? phone_number : currentTransaction.phone_number;
            const finalTransactionRef = transaction_ref !== undefined ? transaction_ref : currentTransaction.transaction_ref;
            const finalTableNumber = table_number !== undefined ? table_number : currentTransaction.table_number;
            const finalIsVip = is_vip !== undefined ? (is_vip ? 1 : 0) : currentTransaction.is_vip;
            const finalAmountPaid = amount_paid !== undefined ? amount_paid : currentTransaction.amount_paid;
            const finalAmountDue = amount_due !== undefined ? amount_due : currentTransaction.amount_due;
            const finalPaymentStatus = payment_status !== undefined ? payment_status : currentTransaction.payment_status;

            db.prepare(`
                UPDATE transactions 
                SET items = ?, total_amount = ?, payment_method = ?, status = ?, partner_name = ?, phone_number = ?, transaction_ref = ?,
                    table_number = ?, is_vip = ?, amount_paid = ?, amount_due = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                finalItems,
                finalTotal,
                finalPaymentMethod,
                finalStatus,
                finalPartnerName,
                finalPhoneNumber,
                finalTransactionRef,
                finalTableNumber,
                finalIsVip,
                finalAmountPaid,
                finalAmountDue,
                finalPaymentStatus,
                id
            );
        });

        updateTransaction();

        const updatedTransaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        updatedTransaction.items = JSON.parse(updatedTransaction.items);
        updatedTransaction.is_vip = Boolean(updatedTransaction.is_vip);

        res.json(updatedTransaction);
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Delete transaction (Hard delete with stock restoration)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Parse items if they are a string
        const items = transaction.items ? (typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items) : [];

        // Start transaction for atomicity
        const deleteTransaction = db.transaction(() => {
            // Restore stock ONLY if transaction was validated
            if (transaction.status === 'validated') {
                for (const item of items) {
                    // Update product stock
                    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);

                    // Get current stock for movement record
                    const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.product_id);

                    // Record stock movement
                    db.prepare(`
                        INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity, stock_before, stock_after, transaction_ref, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(),
                        item.product_id,
                        product ? product.name : item.product_name,
                        'annulation',
                        item.quantity, // Positive quantity for restoration
                        product ? product.stock - item.quantity : 0,
                        product ? product.stock : 0,
                        transaction.reference,
                        `Suppression transaction ${transaction.reference}`
                    );
                }
            }

            // Delete transaction from database
            db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
        });

        deleteTransaction();

        res.json({ message: 'Transaction deleted successfully', id });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update transaction payment (without touching stock)
router.put('/:id/payment', (req, res) => {
    try {
        const { id } = req.params;
        const { amount_paid, amount_due, payment_status, payment_method } = req.body;

        const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Check if this payment reduces the debt (amount_due was > 0 and now becomes 0 or less)
        const wasUnpaid = transaction.amount_due > 0;
        const nowPaid = amount_due === 0 || payment_status === 'paid';

        // Update only payment-related fields, do NOT touch stock
        db.prepare(`
            UPDATE transactions 
            SET amount_paid = ?, amount_due = ?, payment_status = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(amount_paid, amount_due, payment_status, payment_method, id);

        // Decrement customer unpaid count if debt is paid
        if (wasUnpaid && nowPaid && transaction.customer_id) {
            const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(transaction.customer_id);
            if (customer) {
                const newCount = Math.max(0, customer.unpaid_count - 1);
                const shouldUnblock = newCount < 3;
                db.prepare(`
                    UPDATE customers 
                    SET unpaid_count = ?, is_blocked = ?, updated_at = datetime('now')
                    WHERE customer_id = ?
                `).run(newCount, shouldUnblock ? 0 : customer.is_blocked, transaction.customer_id);
            }
        }

        const updatedTransaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        updatedTransaction.items = JSON.parse(updatedTransaction.items);
        updatedTransaction.is_vip = Boolean(updatedTransaction.is_vip);
        updatedTransaction.created_date = updatedTransaction.created_at;

        res.json(updatedTransaction);
    } catch (error) {
        console.error('Error updating transaction payment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get transaction statistics
router.get('/stats/summary', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const todaySales = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM transactions
      WHERE type = 'vente' AND DATE(created_at) = ?
    `).get(today);

        const todayCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM transactions
      WHERE type = 'vente' AND DATE(created_at) = ?
    `).get(today);

        const totalSales = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM transactions
      WHERE type = 'vente'
    `).get();

        res.json({
            todaySales: todaySales.total,
            todayCount: todayCount.count,
            totalSales: totalSales.total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
