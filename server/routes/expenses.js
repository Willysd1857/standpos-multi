const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get all expenses
router.get('/', async (req, res) => {
    try {
        const { start_date, end_date, limit = 1000 } = req.query;
        let query = supabase.from('expenses').select('*');

        if (start_date && end_date) {
            query = query.gte('date', start_date).lte('date', end_date);
        }

        const { data: expenses, error } = await query
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(parseInt(limit, 10) || 1000);

        if (error) throw error;
        res.json(expenses || []);
    } catch (error) {
        console.error('❌ Erreur GET /expenses:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get expense by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: expense, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(expense);
    } catch (error) {
        console.error(`❌ Erreur GET /expenses/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Create expense
router.post('/', async (req, res) => {
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

        const { data: expense, error } = await supabase
            .from('expenses')
            .insert({
                id,
                description,
                amount: Number(amount),
                category: category || '',
                payment_method,
                date,
                notes: notes || ''
            })
            .select()
            .single();

        if (error) throw error;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'CREATE_EXPENSE',
            'expense',
            id,
            {
                description: expense.description,
                amount: expense.amount,
                category: expense.category,
                date: expense.date
            }
        );

        res.status(201).json(expense);
    } catch (error) {
        console.error('❌ Erreur POST /expenses:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update expense
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Sanitize updates
        if (updates.id) delete updates.id;
        if (updates.created_at) delete updates.created_at;
        if (updates.updated_at) delete updates.updated_at;

        updates.updated_at = new Date().toISOString();

        const { data: expense, error } = await supabase
            .from('expenses')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'UPDATE_EXPENSE',
            'expense',
            id,
            {
                description: expense.description,
                amount: expense.amount,
                updated_fields: Object.keys(updates)
            }
        );

        res.json(expense);
    } catch (error) {
        console.error(`❌ Erreur PUT /expenses/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Delete expense
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression de la dépense: ${id}`);

        // Get expense info before deletion
        const { data: expense, error: getError } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getError) throw getError;
        if (!expense) {
            console.warn(`[Delete] Dépense non trouvée: ${id}`);
            return res.status(404).json({ error: 'Expense not found' });
        }

        const { error: deleteError } = await supabase
            .from('expenses')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_EXPENSE',
            'expense',
            id,
            {
                description: expense.description,
                amount: expense.amount,
                category: expense.category
            }
        );

        console.log(`[Delete] Dépense ${id} supprimée avec succès`);
        res.json({ message: 'Expense deleted successfully', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /expenses/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get expense statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = supabase.from('expenses').select('amount, category');

        if (start_date && end_date) {
            query = query.gte('date', start_date).lte('date', end_date);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        let totalExpenses = 0;
        let expenseCount = 0;
        const categoriesMap = {};

        if (rows) {
            expenseCount = rows.length;
            rows.forEach(r => {
                totalExpenses += Number(r.amount) || 0;
                const cat = r.category || 'Non spécifié';
                categoriesMap[cat] = (categoriesMap[cat] || 0) + (Number(r.amount) || 0);
            });
        }

        const byCategory = Object.keys(categoriesMap).map(cat => ({
            category: cat,
            total: categoriesMap[cat]
        }));

        res.json({
            totalExpenses,
            expenseCount,
            byCategory
        });
    } catch (error) {
        console.error('❌ Erreur GET /expenses/stats/summary:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
