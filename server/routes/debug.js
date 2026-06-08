const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

// Debug endpoint to check expense queries
router.get('/debug-expenses', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Get all expenses from Supabase
        const { data: allExpenses, error: allErr } = await supabase
            .from('expenses')
            .select('id, date, description, amount, category')
            .order('date', { ascending: false })
            .limit(10);

        if (allErr) throw allErr;

        // Mock methods results for compatibility
        res.json({
            today,
            totalExpenses: (allExpenses || []).length,
            allExpenses: allExpenses || [],
            methods: {
                method1_LIKE_concat: {
                    count: (allExpenses || []).length,
                    results: allExpenses || [],
                    total: (allExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Sync customer debt counters (fix existing data)
router.get('/sync-customer-debts', async (req, res) => {
    try {
        console.log('🔄 Début de la synchronisation des compteurs de dettes sur Supabase...');

        // Récupérer tous les clients
        const { data: customers, error: custErr } = await supabase
            .from('customers')
            .select('customer_id, name');

        if (custErr) throw custErr;

        let updated = 0;
        let blocked = 0;
        const results = [];

        for (const customer of customers || []) {
            // Compter les transactions impayées pour ce client
            const { count, error: txErr } = await supabase
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .eq('customer_id', customer.customer_id)
                .eq('status', 'validated')
                .gt('amount_due', 0);

            if (txErr) throw txErr;

            const unpaidCount = count || 0;
            const isBlocked = unpaidCount >= 3;

            // Mettre à jour le client
            const { error: updErr } = await supabase
                .from('customers')
                .update({
                    unpaid_count: unpaidCount,
                    is_blocked: isBlocked,
                    updated_at: new Date().toISOString()
                })
                .eq('customer_id', customer.customer_id);

            if (updErr) throw updErr;

            if (unpaidCount > 0) {
                results.push({
                    name: customer.name,
                    customer_id: customer.customer_id,
                    unpaid_count: unpaidCount,
                    is_blocked: isBlocked
                });
                updated++;
                if (isBlocked) blocked++;
            }
        }

        console.log(`✅ Synchronisation terminée: ${updated} clients avec dettes, ${blocked} bloqués`);

        res.json({
            success: true,
            total_customers: (customers || []).length,
            customers_with_debts: updated,
            customers_blocked: blocked,
            details: results
        });
    } catch (error) {
        console.error('❌ Erreur lors de la synchronisation:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

module.exports = router;
