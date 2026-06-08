const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

// Helper to get start of a period
function getStartDate(period) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    switch (period) {
        case 'weekly':
            d.setDate(d.getDate() - 7);
            break;
        case 'monthly':
            d.setMonth(d.getMonth() - 1);
            break;
        case 'quarterly':
            d.setMonth(d.getMonth() - 3);
            break;
        default:
            d.setDate(d.getDate() - 7);
    }
    return d.toISOString();
}

// 1. ANALYSE PÉRIODIQUE
router.get('/periodic', async (req, res) => {
    try {
        const { period = 'weekly' } = req.query;
        const startDate = getStartDate(period);
        const endDate = new Date().toISOString();

        // Ventes
        const { data: sales, error: salesErr } = await supabase
            .from('transactions')
            .select('created_at, total_amount')
            .eq('type', 'vente')
            .eq('status', 'validated')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
        if (salesErr) throw salesErr;

        // Dépenses
        const { data: expenses, error: expErr } = await supabase
            .from('expenses')
            .select('date, amount')
            .gte('date', startDate.split('T')[0])
            .lte('date', endDate.split('T')[0]);
        if (expErr) throw expErr;

        // Group by date
        const groupedData = {};
        
        sales.forEach(s => {
            const date = s.created_at.split('T')[0];
            if (!groupedData[date]) groupedData[date] = { date, sales: 0, expenses: 0 };
            groupedData[date].sales += Number(s.total_amount) || 0;
        });

        expenses.forEach(e => {
            const date = e.date.split('T')[0];
            if (!groupedData[date]) groupedData[date] = { date, sales: 0, expenses: 0 };
            groupedData[date].expenses += Number(e.amount) || 0;
        });

        const chartData = Object.values(groupedData).sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            period,
            chartData,
            summary: {
                totalSales: chartData.reduce((acc, curr) => acc + curr.sales, 0),
                totalExpenses: chartData.reduce((acc, curr) => acc + curr.expenses, 0)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. TRÉSORERIE & FLUX DE CAISSE
router.get('/cashflow', async (req, res) => {
    try {
        const { date = new Date().toISOString().split('T')[0] } = req.query;

        // Transactions pour les recettes
        const { data: transactions, error: txErr } = await supabase
            .from('transactions')
            .select('*')
            .in('type', ['vente', 'remboursement_consigne'])
            .eq('status', 'validated')
            .gte('created_at', `${date}T00:00:00.000Z`)
            .lte('created_at', `${date}T23:59:59.999Z`);
        if (txErr) throw txErr;

        // Dépenses
        const { data: expenses, error: expErr } = await supabase
            .from('expenses')
            .select('*')
            .eq('date', date);
        if (expErr) throw expErr;

        // Achats
        const { data: purchases, error: purErr } = await supabase
            .from('purchase_groups')
            .select('*')
            .eq('date', date)
            .eq('status', 'validated');
        if (purErr) throw purErr;

        let totalRecettes = 0;
        let recettesByType = {};
        
        transactions.forEach(tx => {
            totalRecettes += Number(tx.amount_paid) || 0;
            if (!recettesByType[tx.type]) recettesByType[tx.type] = 0;
            recettesByType[tx.type] += Number(tx.amount_paid) || 0;
        });

        let totalDepenses = 0;
        let depensesByCategory = {};

        expenses.forEach(e => {
            totalDepenses += Number(e.amount) || 0;
            const cat = e.category || 'Autre';
            if (!depensesByCategory[cat]) depensesByCategory[cat] = 0;
            depensesByCategory[cat] += Number(e.amount) || 0;
        });

        purchases.forEach(p => {
            totalDepenses += Number(p.total_amount) || 0;
            const cat = 'Achat Fournisseur';
            if (!depensesByCategory[cat]) depensesByCategory[cat] = 0;
            depensesByCategory[cat] += Number(p.total_amount) || 0;
        });

        // Journal Chronologique combiné
        let journal = [];
        transactions.forEach(t => journal.push({ time: t.created_at, type: 'Entrée', description: `Vente #${t.id}`, amount: t.amount_paid }));
        expenses.forEach(e => journal.push({ time: e.created_at || `${date}T12:00:00.000Z`, type: 'Sortie', description: e.description, amount: e.amount }));
        purchases.forEach(p => journal.push({ time: p.created_at || `${date}T12:00:00.000Z`, type: 'Sortie', description: `Achat ${p.reference}`, amount: p.total_amount }));

        journal.sort((a, b) => new Date(a.time) - new Date(b.time));

        // Format for charts
        const incomePie = Object.keys(recettesByType).map(k => ({ name: k, value: recettesByType[k] }));
        const expensePie = Object.keys(depensesByCategory).map(k => ({ name: k, value: depensesByCategory[k] }));

        res.json({
            date,
            totalRecettes,
            totalDepenses,
            solde: totalRecettes - totalDepenses,
            incomePie,
            expensePie,
            journal
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. RENTABILITÉ & MARGES
router.get('/margins', async (req, res) => {
    try {
        const { date = new Date().toISOString().split('T')[0] } = req.query;

        // Ventes
        const { data: transactions, error: txErr } = await supabase
            .from('transactions')
            .select('items, total_amount')
            .eq('type', 'vente')
            .eq('status', 'validated')
            .gte('created_at', `${date}T00:00:00.000Z`)
            .lte('created_at', `${date}T23:59:59.999Z`);
        if (txErr) throw txErr;

        let totalRevenue = 0;
        let totalCogs = 0;
        let productMargins = {};

        // To accurately calculate without multiple queries per item, we might need all products to map cost_price
        const { data: products, error: prodErr } = await supabase.from('products').select('id, name, cost_price');
        if (prodErr) throw prodErr;
        const productMap = {};
        products.forEach(p => productMap[p.id] = p);

        transactions.forEach(tx => {
            totalRevenue += Number(tx.total_amount) || 0;
            let items = [];
            try {
                items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
            } catch (e) { items = tx.items || []; }

            items.forEach(item => {
                const pInfo = productMap[item.product_id];
                const cost = pInfo ? Number(pInfo.cost_price) : (Number(item.cost_price) || 0);
                const itemCogs = cost * (Number(item.quantity) || 0);
                totalCogs += itemCogs;
                
                const itemRevenue = Number(item.total) || 0;
                const margin = itemRevenue - itemCogs;

                if (!productMargins[item.product_name]) {
                    productMargins[item.product_name] = { name: item.product_name, revenue: 0, margin: 0 };
                }
                productMargins[item.product_name].revenue += itemRevenue;
                productMargins[item.product_name].margin += margin;
            });
        });

        const grossMargin = totalRevenue - totalCogs;
        const productMarginList = Object.values(productMargins).sort((a, b) => b.margin - a.margin).slice(0, 10);

        res.json({
            date,
            totalRevenue,
            totalCogs,
            grossMargin,
            marginPercent: totalRevenue > 0 ? ((grossMargin / totalRevenue) * 100).toFixed(2) : 0,
            productMarginList
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. ÉTAT DES TIERS
router.get('/third-parties', async (req, res) => {
    try {
        // Clients (Transactions non payées totalement)
        const { data: clientDebts, error: cErr } = await supabase
            .from('transactions')
            .select('partner_name, amount_due, total_amount')
            .eq('type', 'vente')
            .eq('payment_status', 'partial')
            .gt('amount_due', 0);
        if (cErr) throw cErr;

        let clientsMap = {};
        clientDebts.forEach(tx => {
            const name = tx.partner_name || 'Client Divers';
            if (!clientsMap[name]) clientsMap[name] = { name, debt: 0, total_sales: 0 };
            clientsMap[name].debt += Number(tx.amount_due) || 0;
            clientsMap[name].total_sales += Number(tx.total_amount) || 0;
        });

        // Fournisseurs (Dettes)
        const { data: supplierDebts, error: sErr } = await supabase
            .from('purchase_groups')
            .select('supplier_name, amount_due, total_amount')
            .eq('status', 'validated')
            .gt('amount_due', 0);
        if (sErr) throw sErr;

        let suppliersMap = {};
        supplierDebts.forEach(p => {
            const name = p.supplier_name || 'Fournisseur Inconnu';
            if (!suppliersMap[name]) suppliersMap[name] = { name, debt: 0, total_purchases: 0 };
            suppliersMap[name].debt += Number(p.amount_due) || 0;
            suppliersMap[name].total_purchases += Number(p.total_amount) || 0;
        });

        // Consignations
        const { data: consignments, error: consErr } = await supabase
            .from('packaging_consignments')
            .select('entity_type, entity_name, quantity, status');
        if (consErr) throw consErr;

        let clientConsignments = 0;
        let supplierConsignments = 0;

        consignments.forEach(c => {
            if (c.status === 'active') {
                if (c.entity_type === 'customer') clientConsignments += Number(c.quantity) || 0;
                if (c.entity_type === 'supplier') supplierConsignments += Number(c.quantity) || 0;
            }
        });

        res.json({
            clientDebts: Object.values(clientsMap).sort((a,b) => b.debt - a.debt),
            supplierDebts: Object.values(suppliersMap).sort((a,b) => b.debt - a.debt),
            clientConsignments,
            supplierConsignments
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. SITUATION GÉNÉRALE DE L’ENTREPRISE
router.get('/financial-status', async (req, res) => {
    try {
        // Stock Value and Packaging Value
        const { data: products, error: pErr } = await supabase
            .from('products')
            .select('stock, cost_price, is_ingredient, empty_packaging_qty, empty_secondary_packaging_qty, bottle_deposit_price, crate_deposit_price');
        if (pErr) throw pErr;

        let totalStockValue = 0;
        let totalPackagingValue = 0;
        
        products.forEach(p => {
            totalStockValue += (Number(p.stock) || 0) * (Number(p.cost_price) || 0);
            totalPackagingValue += (Number(p.empty_packaging_qty) || 0) * (Number(p.bottle_deposit_price) || 0);
            totalPackagingValue += (Number(p.empty_secondary_packaging_qty) || 0) * (Number(p.crate_deposit_price) || 0);
        });

        // Dettes Fournisseurs
        const { data: supplierDebts, error: sErr } = await supabase
            .from('purchase_groups')
            .select('amount_due')
            .eq('status', 'validated')
            .gt('amount_due', 0);
        if (sErr) throw sErr;
        
        let totalSupplierDebt = 0;
        supplierDebts.forEach(d => totalSupplierDebt += Number(d.amount_due) || 0);

        // Créances Clients
        const { data: clientDebts, error: cErr } = await supabase
            .from('transactions')
            .select('amount_due')
            .eq('type', 'vente')
            .gt('amount_due', 0);
        if (cErr) throw cErr;

        let totalClientDebt = 0;
        clientDebts.forEach(d => totalClientDebt += Number(d.amount_due) || 0);

        const actif = totalStockValue + totalPackagingValue + totalClientDebt;
        const passif = totalSupplierDebt;
        const patrimoineNet = actif - passif;

        res.json({
            stockValue: totalStockValue,
            packagingValue: totalPackagingValue,
            totalClientDebt,
            totalSupplierDebt,
            actif,
            passif,
            patrimoineNet
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
