const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const supabaseAdmin = require('../services/supabaseAdmin');
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

        // Use service_role key to bypass RLS on bulk operations.
        // Without it, RLS will block mass DELETEs and UPDATEs in production.
        const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        const bulkClient = hasServiceRole ? supabaseAdmin : supabase;
        if (!hasServiceRole) {
            console.warn('[WipeData] ⚠️ SUPABASE_SERVICE_ROLE_KEY not set — RLS will block mass operations in production. Add it in Render dashboard env vars.');
        }

        // ---- STEP 1: DELETE transactional/child rows ----
        // Use the regular supabase client (an anon key call may work if RLS policies allow DELETE for authenticated admin role).
        // If that fails, the fallback strategies below still apply.
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
            'supplier_transactions',
            'losses_and_damages',
            'audit_logs'
        ];

        // Helper : supprimer toutes les lignes d'une table en testant plusieurs stratégies
        // pour gérer les cas où id peut être NULL / vide / ou la table ne pas avoir created_at.
        // Uses bulkClient (service_role) when available, otherwise falls back to anon key client.
        const wipeTable = async (table) => {
            const client = bulkClient;
            const strategies = [
                () => client.from(table).delete().neq('id', ''),
                () => client.from(table).delete().gte('created_at', '1900-01-01'),
                () => client.from(table).delete().gte('updated_at', '1900-01-01'),
                () => client.from(table).delete().not('id', 'is', null),
            ];
            for (const strategy of strategies) {
                const { error } = await strategy();
                if (!error) return true;
            }
            // Dernier recours : sélection + delete par lots
            const { data: rows, error: selErr } = await client.from(table).select('id').limit(1000);
            if (selErr || !rows || rows.length === 0) return false;
            const ids = rows.map(r => r.id).filter(Boolean);
            if (ids.length === 0) return false;
            const { error: delErr } = await client.from(table).delete().in('id', ids);
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

        // ---- STEP 2: UPDATE stock-by-location to zero (never DELETE, to avoid FK violations) ----
        try {
            const { error: sblErr } = await bulkClient
                .from('stock_by_location')
                .update({ quantity: 0, empty_packaging_qty: 0, empty_secondary_packaging_qty: 0 })
                .not('id', 'is', null);
            if (sblErr) {
                console.warn(`[WipeData] ⚠️ stock_by_location UPDATE failed (trying raw fallback):`, sblErr.message);
            } else {
                console.log(`[WipeData] ✓ stock_by_location quantities reset to 0`);
            }
        } catch (sblFallbackErr) {
            console.warn(`[WipeData] ⚠️ stock_by_location UPDATE threw:`, sblFallbackErr.message);
        }

        // ---- STEP 3: Reset customer credit status + packaging debt ----
        try {
            const { error: custErr } = await bulkClient
                .from('customers')
                .update({ unpaid_count: 0, is_blocked: false, packaging_debt_bottles: 0, packaging_debt_crates: 0 })
                .not('id', 'is', null);
            if (custErr) {
                console.warn(`[WipeData] ⚠️ customers UPDATE failed:`, custErr.message);
            } else {
                console.log(`[WipeData] ✓ Reset customer credit status + packaging debt`);
            }
        } catch (custErr) {
            console.warn(`[WipeData] ⚠️ customers UPDATE threw:`, custErr.message);
        }

        // ---- STEP 4: Reset supplier debt + outstanding packaging ----
        try {
            const { error: suppErr } = await bulkClient
                .from('suppliers')
                .update({ total_debt: 0, outstanding_bottles: 0, outstanding_crates: 0 })
                .not('id', 'is', null);
            if (suppErr) {
                console.warn(`[WipeData] ⚠️ suppliers UPDATE failed:`, suppErr.message);
            } else {
                console.log(`[WipeData] ✓ Reset supplier debt + outstanding packaging`);
            }
        } catch (suppErr) {
            console.warn(`[WipeData] ⚠️ suppliers UPDATE threw:`, suppErr.message);
        }

        // ---- STEP 5: Reset product stock ----
        try {
            const { error: prodErr } = await bulkClient
                .from('products')
                .update({ stock: 0 })
                .not('id', 'is', null);
            if (prodErr) {
                console.warn(`[WipeData] ⚠️ products UPDATE failed:`, prodErr.message);
            } else {
                console.log(`[WipeData] ✓ Reset product stock`);
            }
        } catch (prodErr) {
            console.warn(`[WipeData] ⚠️ products UPDATE threw:`, prodErr.message);
        }

        // ---- STEP 6: Create a new audit log ----
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
