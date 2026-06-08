const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/daily', async (req, res) => {
    try {
        const { date } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        // 1. Sales Summary (Transactions generated today)
        const { data: transactions, error: txErr } = await supabase
            .from('transactions')
            .select('*')
            .in('type', ['vente', 'remboursement_consigne'])
            .eq('status', 'validated')
            .gte('created_at', `${reportDate}T00:00:00.000Z`)
            .lte('created_at', `${reportDate}T23:59:59.999Z`);

        if (txErr) throw txErr;

        let total_revenue = 0;
        let transaction_count = 0;
        let total_due = 0;

        (transactions || []).forEach(tx => {
            total_revenue += Number(tx.total_amount) || 0;
            if (tx.type === 'vente') transaction_count++;
            total_due += Number(tx.amount_due) || 0;
        });

        // 1b. Actual Cash Received today (including payments for old debts) from payments table
        const { data: payments, error: payErr } = await supabase
            .from('payments')
            .select('amount')
            .gte('created_at', `${reportDate}T00:00:00.000Z`)
            .lte('created_at', `${reportDate}T23:59:59.999Z`);

        if (payErr) throw payErr;

        let total_paid = 0;
        (payments || []).forEach(p => {
            total_paid += Number(p.amount) || 0;
        });
        
        // Also add the negative amount_paid from refunds to deduct from total_paid
        (transactions || []).forEach(tx => {
            if (tx.type === 'remboursement_consigne') {
                total_paid += Number(tx.amount_paid) || 0;
            }
        });

        // 2. Best Selling Products
        const productAggregation = {};
        (transactions || []).forEach(tx => {
            if (tx.type !== 'vente') return;
            let items = [];
            try {
                items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
            } catch (e) {
                items = tx.items || [];
            }

            (items || []).forEach(item => {
                const id = item.product_id;
                if (!id) return;
                
                if (!productAggregation[id]) {
                    productAggregation[id] = {
                        name: item.product_name,
                        quantity: 0,
                        revenue: 0,
                        profit: 0
                    };
                }
                productAggregation[id].quantity += Number(item.quantity) || 0;
                productAggregation[id].revenue += Number(item.total) || 0;

                // If cost_price was stored in the item at checkout, use it
                if (item.cost_price !== undefined) {
                    const currentTotalCogs = (productAggregation[id].stored_cogs || 0);
                    productAggregation[id].stored_cogs = currentTotalCogs + (Number(item.cost_price) * Number(item.quantity));
                    productAggregation[id].has_stored_cost = true;
                }
            });
        });

        // Fetch cost prices to calculate profit
        const productIds = Object.keys(productAggregation);
        if (productIds.length > 0) {
            const { data: costPrices, error: costErr } = await supabase
                .from('products')
                .select('id, cost_price, price')
                .in('id', productIds);

            if (costErr) throw costErr;

            (costPrices || []).forEach(p => {
                if (productAggregation[p.id]) {
                    const agg = productAggregation[p.id];
                    // Use stored COGS if available, otherwise calculate from current cost_price
                    if (agg.has_stored_cost) {
                        agg.cost_price = agg.stored_cogs / agg.quantity; // Average cost for report display
                        agg.profit = agg.revenue - agg.stored_cogs;
                    } else {
                        agg.cost_price = Number(p.cost_price) || 0;
                        agg.profit = agg.revenue - ((Number(p.cost_price) || 0) * agg.quantity);
                    }
                }
            });
        }

        const bestSellers = Object.values(productAggregation)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        const mostProfitable = Object.values(productAggregation)
            .filter(p => p.profit !== undefined)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10);

        // 3. Expenses
        const { data: expenses, error: expErr } = await supabase
            .from('expenses')
            .select('description, amount, category, payment_method')
            .gte('date', reportDate)
            .lte('date', reportDate);

        if (expErr) throw expErr;

        const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

        // 4. Purchases (Restocking)
        const { data: purchases, error: purErr } = await supabase
            .from('purchase_groups')
            .select('reference, supplier_name, total_amount, payment_method')
            .gte('date', reportDate)
            .lte('date', reportDate)
            .eq('status', 'validated');

        if (purErr) throw purErr;

        const totalPurchases = (purchases || []).reduce((sum, p) => sum + Number(p.total_amount), 0);

        // 5. Stock Status
        const { data: productsStock, error: stErr } = await supabase
            .from('products')
            .select('name, stock, min_stock, unit, is_active, is_ingredient');

        if (stErr) throw stErr;

        const lowStock = (productsStock || [])
            .filter(p => p.is_active && !p.is_ingredient && Number(p.stock) <= Number(p.min_stock))
            .map(p => ({
                name: p.name,
                stock: Number(p.stock),
                min_stock: Number(p.min_stock),
                unit: p.unit
            }));

        const { data: ingredientsStock, error: ingStErr } = await supabase
            .from('ingredients')
            .select('name, stock_quantity, min_stock, unit');

        if (ingStErr) throw ingStErr;

        const ingredientsLowStock = (ingredientsStock || [])
            .filter(i => Number(i.stock_quantity) <= Number(i.min_stock))
            .map(i => ({
                name: i.name,
                stock: Number(i.stock_quantity),
                min_stock: Number(i.min_stock),
                unit: i.unit
            }));

        // 6. Ingredient Usage
        const { data: usageMovs, error: usageErr } = await supabase
            .from('ingredient_movements')
            .select('ingredient_name, quantity, ingredient_id')
            .gte('created_at', `${reportDate}T00:00:00.000Z`)
            .lte('created_at', `${reportDate}T23:59:59.999Z`)
            .eq('movement_type', 'usage');

        if (usageErr) throw usageErr;

        const usageAgg = {};
        (usageMovs || []).forEach(m => {
            const name = m.ingredient_name;
            if (!usageAgg[name]) {
                usageAgg[name] = {
                    ingredient_name: name,
                    total_used: 0,
                    ingredient_id: m.ingredient_id
                };
            }
            usageAgg[name].total_used += Math.abs(Number(m.quantity)) || 0;
        });

        const ingredientIds = Object.values(usageAgg).map(u => u.ingredient_id).filter(Boolean);
        if (ingredientIds.length > 0) {
            const { data: ings, error: ingsErr } = await supabase
                .from('ingredients')
                .select('id, unit_cost')
                .in('id', ingredientIds);

            if (ingsErr) throw ingsErr;

            (ings || []).forEach(i => {
                Object.values(usageAgg).forEach(u => {
                    if (u.ingredient_id === i.id) {
                        u.unit_cost = Number(i.unit_cost) || 0;
                    }
                });
            });
        }

        const ingredientUsage = Object.values(usageAgg);

        // 7. Balance Calculation (Gross margin & Cash balance)
        const cogs = Object.keys(productAggregation).reduce((sum, id) => {
            const item = productAggregation[id];
            if (item.has_stored_cost) {
                return sum + item.stored_cogs;
            }
            return sum + ((item.cost_price || 0) * item.quantity);
        }, 0);

        const grossMargin = total_revenue - cogs;
        const totalExpensesCombined = totalExpenses + totalPurchases;
        const soldeTotal = total_paid - totalExpensesCombined;

        res.json({
            date: reportDate,
            summary: {
                revenue: total_revenue,
                transaction_count: transaction_count,
                total_paid: total_paid,
                total_due: total_due,
                total_expenses: totalExpensesCombined, // Combined total for display
                operational_expenses: totalExpenses, // Operational only
                total_purchases: totalPurchases,
                gross_margin: grossMargin,
                net_profit: soldeTotal, // For backward compatibility
                solde_total: soldeTotal, // New field name
                cogs: cogs
            },
            best_sellers: bestSellers,
            most_profitable: mostProfitable,
            expenses: expenses || [],
            purchases: purchases || [],
            stock_alerts: {
                products: lowStock,
                ingredients: ingredientsLowStock
            },
            ingredient_usage: ingredientUsage
        });

    } catch (error) {
        console.error('❌ Error generating daily report data:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
