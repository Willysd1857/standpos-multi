const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const { db } = require('../database');

router.get('/download', async (req, res) => {
    try {
        const wb = xlsx.utils.book_new();

        // 1. Transactions
        const transactions = db.prepare(`
            SELECT 
                t.reference as "Référence", 
                t.type as "Type", 
                t.total_amount as "Montant Total", 
                t.payment_method as "Méthode Paiement", 
                t.status as "Statut", 
                t.partner_name as "Client/Partenaire", 
                datetime(t.created_at, 'localtime') as "Date", 
                t.amount_paid as "Payé", 
                t.amount_due as "Reste", 
                t.payment_status as "Statut Paiement"
            FROM transactions t
            ORDER BY t.created_at DESC
        `).all();
        const wsTransactions = xlsx.utils.json_to_sheet(transactions);
        wsTransactions['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
        xlsx.utils.book_append_sheet(wb, wsTransactions, "Ventes");

        // 2. Produits
        const products = db.prepare(`
            SELECT 
                p.name as "Nom", 
                c.name as "Catégorie", 
                p.price as "Prix Vente", 
                p.stock as "Stock Actuel", 
                p.cost_price as "Coût Achat", 
                p.min_stock as "Stock Min", 
                CASE WHEN p.is_active = 1 THEN 'Oui' ELSE 'Non' END as "Actif"
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.name ASC
        `).all();
        const wsProducts = xlsx.utils.json_to_sheet(products);
        wsProducts['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 5 }];
        xlsx.utils.book_append_sheet(wb, wsProducts, "Produits");

        // 3. Dépenses
        const expenses = db.prepare(`
            SELECT 
                description as "Description", 
                amount as "Montant", 
                category as "Catégorie", 
                payment_method as "Moyen Paiement", 
                date as "Date", 
                notes as "Notes"
            FROM expenses
            ORDER BY date DESC
        `).all();
        const wsExpenses = xlsx.utils.json_to_sheet(expenses);
        wsExpenses['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
        xlsx.utils.book_append_sheet(wb, wsExpenses, "Dépenses");

        // 4. Stock Movements
        const movements = db.prepare(`
            SELECT 
                product_name as "Produit", 
                movement_type as "Type Mouvement", 
                quantity as "Quantité", 
                stock_before as "Stock Avant", 
                stock_after as "Stock Après", 
                datetime(created_at, 'localtime') as "Date", 
                notes as "Notes", 
                transaction_ref as "Réf Transaction"
            FROM stock_movements
            ORDER BY created_at DESC
        `).all();
        const wsMovements = xlsx.utils.json_to_sheet(movements);
        wsMovements['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 20 }];
        xlsx.utils.book_append_sheet(wb, wsMovements, "Mouvements Stock");


        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Donnees_Moonlight_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        res.send(buffer);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

module.exports = router;
