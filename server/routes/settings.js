const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get settings
router.get('/', async (req, res) => {
    try {
        const { data: settings, error } = await supabase
            .from('settings')
            .select('*')
            .eq('id', 'default')
            .maybeSingle();

        if (error) throw error;
        res.json(settings || {});
    } catch (error) {
        console.error('❌ Erreur GET /settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update settings
router.put('/', async (req, res) => {
    try {
        const updates = { ...req.body };

        // Sanitize updates
        if (updates.id) delete updates.id;
        if (updates.created_at) delete updates.created_at;
        if (updates.updated_at) delete updates.updated_at;

        updates.updated_at = new Date().toISOString();

        const { data: settings, error } = await supabase
            .from('settings')
            .update(updates)
            .eq('id', 'default')
            .select()
            .single();

        if (error) throw error;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'UPDATE_SETTINGS',
            'settings',
            'default',
            {
                updated_fields: Object.keys(updates)
            }
        );

        res.json(settings);
    } catch (error) {
        console.error('❌ Erreur PUT /settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Wipe all data (Transactions, Expenses, Logs, etc.)
router.post('/wipe-data', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        console.log(`[WipeData] Request from user: ${user.username} (Role: ${user.role})`);

        // Check if user is admin (Backend check for safety)
        if (user.role !== 'admin') {
            console.warn(`[WipeData] Unauthorized attempt from user: ${user.username}`);
            return res.status(403).json({ error: 'Seul l\'administrateur peut effectuer cette action.' });
        }

        const tablesToClear = [
            'transactions',
            'payments',
            'stock_movements',
            'expenses',
            'purchase_groups',
            'purchase_group_items',
            'purchases',
            'ingredient_movements',
            'ingredient_usage_groups',
            'packaging_movements',
            'packaging_consignments',
            'stock_transfer_items',
            'stock_transfers',
            'losses_and_damages',
            'stock_by_location',
            'audit_logs'
        ];

        // Helper : supprimer toutes les lignes d'une table en testant plusieurs stratégies
        // pour gérer les cas où id peut être NULL / vide / ou la table ne pas avoir created_at.
        const wipeTable = async (table) => {
            const strategies = [
                () => supabase.from(table).delete().neq('id', ''),
                () => supabase.from(table).delete().gte('created_at', '1900-01-01'),
                () => supabase.from(table).delete().gte('updated_at', '1900-01-01'),
                () => supabase.from(table).delete().not('id', 'is', null),
            ];
            for (const strategy of strategies) {
                const { error } = await strategy();
                if (!error) return true;
            }
            // Dernier recours : sélection + delete par lots
            const { data: rows, error: selErr } = await supabase.from(table).select('id').limit(1000);
            if (selErr || !rows || rows.length === 0) return false;
            const ids = rows.map(r => r.id).filter(Boolean);
            if (ids.length === 0) return false;
            const { error: delErr } = await supabase.from(table).delete().in('id', ids);
            return !delErr;
        };

        for (const table of tablesToClear) {
            const ok = await wipeTable(table);
            if (ok) {
                console.log(`[WipeData] ✓ Cleared ${table}`);
            } else {
                console.warn(`[WipeData] ⚠️ Could not fully clear table ${table}`);
            }
        }

        // Reset customer credit status
        await supabase
            .from('customers')
            .update({ unpaid_count: 0, is_blocked: false })
            .not('id', 'is', null);

        console.log(`[WipeData] Reset customer credit status`);

        // Reset product stock + packaging counters
        await supabase
            .from('products')
            .update({
                stock: 0,
                empty_packaging_qty: 0,
                empty_secondary_packaging_qty: 0
            })
            .not('id', 'is', null);

        console.log(`[WipeData] Reset product stock + packaging counters`);

        // Create a new audit log
        createAuditLog(
            user.id,
            user.username,
            'WIPE_ALL_DATA',
            'system',
            'all',
            {
                timestamp: new Date().toISOString(),
                message: "Réinitialisation complète des données effectuée par l'administrateur."
            }
        );

        res.json({ success: true, message: 'Toutes les données transactionnelles ont été supprimées avec succès.' });
    } catch (error) {
        console.error('❌ [WipeData] Global error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
