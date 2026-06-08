const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const supabase = require('../services/supabaseClient');

function adjustTimeGMT3(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        // Add 3 hours for GMT+3
        const adjusted = new Date(d.getTime() + 3 * 60 * 60 * 1000);
        return adjusted.toISOString().replace('T', ' ').substring(0, 19);
    } catch (e) {
        return dateStr;
    }
}

router.get('/download', async (req, res) => {
    try {
        const wb = xlsx.utils.book_new();

        // 1. Transactions
        const { data: transactions, error: txErr } = await supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false });

        if (txErr) throw txErr;

        const txExport = (transactions || []).map(t => ({
            "Référence": t.reference,
            "Type": t.type,
            "Montant Total": t.total_amount,
            "Méthode Paiement": t.payment_method,
            "Statut": t.status,
            "Client/Partenaire": t.partner_name,
            "Date (GMT+3)": adjustTimeGMT3(t.created_at),
            "Payé": t.amount_paid,
            "Reste": t.amount_due,
            "Statut Paiement": t.payment_status
        }));

        const wsTransactions = xlsx.utils.json_to_sheet(txExport);
        wsTransactions['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
        xlsx.utils.book_append_sheet(wb, wsTransactions, "Ventes");

        // 2. Produits
        const { data: products, error: prodErr } = await supabase
            .from('products')
            .select('*, category:categories(name)')
            .order('name', { ascending: true });

        if (prodErr) throw prodErr;

        const prodExport = (products || []).map(p => ({
            "Nom": p.name,
            "Catégorie": p.category?.name || '',
            "Prix Vente": p.price,
            "Stock Actuel": p.stock,
            "Coût Achat": p.cost_price,
            "Stock Min": p.min_stock,
            "Actif": p.is_active ? 'Oui' : 'Non'
        }));

        const wsProducts = xlsx.utils.json_to_sheet(prodExport);
        wsProducts['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 5 }];
        xlsx.utils.book_append_sheet(wb, wsProducts, "Produits");

        // 3. Dépenses
        const { data: expenses, error: expErr } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false });

        if (expErr) throw expErr;

        const expExport = (expenses || []).map(e => ({
            "Description": e.description,
            "Montant": e.amount,
            "Catégorie": e.category,
            "Moyen Paiement": e.payment_method,
            "Date": e.date,
            "Notes": e.notes || ''
        }));

        const wsExpenses = xlsx.utils.json_to_sheet(expExport);
        wsExpenses['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
        xlsx.utils.book_append_sheet(wb, wsExpenses, "Dépenses");

        // 4. Mouvements Stock
        const { data: movements, error: movErr } = await supabase
            .from('stock_movements')
            .select('*')
            .order('created_at', { ascending: false });

        if (movErr) throw movErr;

        const movExport = (movements || []).map(m => ({
            "Produit": m.product_name,
            "Type Mouvement": m.movement_type,
            "Quantité": m.quantity,
            "Stock Avant": m.stock_before,
            "Stock Après": m.stock_after,
            "Date (GMT+3)": adjustTimeGMT3(m.created_at),
            "Notes": m.notes || '',
            "Réf Transaction": m.transaction_ref || ''
        }));

        const wsMovements = xlsx.utils.json_to_sheet(movExport);
        wsMovements['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 20 }];
        xlsx.utils.book_append_sheet(wb, wsMovements, "Mouvements Stock");

        // 5. Journaux d'Audit
        const { data: auditLogs, error: auditErr } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (auditErr) throw auditErr;

        const auditExport = (auditLogs || []).map(log => ({
            "Date (GMT+3)": adjustTimeGMT3(log.created_at),
            "Utilisateur": log.username,
            "Action": log.action,
            "Entité": log.entity_type || '',
            "ID Entité": log.entity_id || '',
            "Détails": typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || ''
        }));

        const wsAudit = xlsx.utils.json_to_sheet(auditExport);
        wsAudit['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 50 }];
        xlsx.utils.book_append_sheet(wb, wsAudit, "Journaux d'Audit");

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Donnees_StandPOS_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        res.send(buffer);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data: ' + error.message });
    }
});

module.exports = router;
