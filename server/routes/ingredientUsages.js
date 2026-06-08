const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');

// Create ingredient usage (multiple ingredients)
router.post('/', async (req, res) => {
    try {
        const { ingredients, notes = '' } = req.body;

        if (!ingredients || ingredients.length === 0) {
            return res.status(400).json({ error: 'Au moins un ingrédient requis' });
        }

        const groupId = uuidv4();
        
        // Generate reference: USAGE-XXX-DDMMYYYY
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}${month}${year}`;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { count, error: countErr } = await supabase
            .from('ingredient_usage_groups')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startOfDay.toISOString());

        if (countErr) throw countErr;

        const sequence = String((count || 0) + 1).padStart(3, '0');
        const reference = `USAGE-${sequence}-${dateStr}`;

        // Insert usage group
        const { error: insertGroupErr } = await supabase
            .from('ingredient_usage_groups')
            .insert({
                id: groupId,
                reference,
                notes: notes || null
            });

        if (insertGroupErr) throw insertGroupErr;

        const results = [];

        // Process each ingredient
        for (const item of ingredients) {
            const { ingredient_id, quantity } = item;

            if (!ingredient_id || !quantity || quantity <= 0) {
                throw new Error('Données d\'ingrédient invalides');
            }

            // Get ingredient (from products where is_ingredient is true or it's a raw material)
            const { data: ingredient, error: getIngErr } = await supabase
                .from('products')
                .select('*')
                .eq('id', ingredient_id)
                .maybeSingle();

            if (getIngErr) throw getIngErr;
            if (!ingredient) {
                throw new Error(`Ingrédient non trouvé: ${ingredient_id}`);
            }

            const stock_before = Number(ingredient.stock) || 0;
            const stock_after = stock_before - Number(quantity);

            // Check stock availability
            if (stock_after < 0) {
                throw new Error(`Stock insuffisant pour ${ingredient.name}. Disponible: ${stock_before} ${ingredient.unit}`);
            }

            // Update stock
            const { error: updateStockErr } = await supabase
                .from('products')
                .update({ stock: stock_after })
                .eq('id', ingredient_id);

            if (updateStockErr) throw updateStockErr;

            // Create movement
            const movementId = uuidv4();
            const { error: insertMovErr } = await supabase
                .from('ingredient_movements')
                .insert({
                    id: movementId,
                    ingredient_id,
                    ingredient_name: ingredient.name,
                    unit: ingredient.unit || null,
                    movement_type: 'usage',
                    quantity: -Number(quantity),
                    stock_before,
                    stock_after,
                    notes: `Utilisation - ${reference}`
                });

            if (insertMovErr) throw insertMovErr;

            results.push({
                name: ingredient.name,
                quantity: Number(quantity),
                unit: ingredient.unit || '',
                stock_before,
                stock_after
            });
        }

        res.status(201).json({ reference, groupId, results });
    } catch (error) {
        console.error('❌ Erreur POST /ingredient-usages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all usage groups
router.get('/', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const { data: usages, error: getUsagesErr } = await supabase
            .from('ingredient_usage_groups')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit, 10) || 50);

        if (getUsagesErr) throw getUsagesErr;

        const usagesWithDetails = [];

        // Get ingredients for each usage group
        for (const usage of usages || []) {
            const { data: movements, error: getMovsErr } = await supabase
                .from('ingredient_movements')
                .select(`
                    *,
                    product:products!ingredient_id(unit)
                `)
                .ilike('notes', `%${usage.reference}%`)
                .eq('movement_type', 'usage')
                .order('created_at', { ascending: true });

            if (getMovsErr) throw getMovsErr;

            usagesWithDetails.push({
                ...usage,
                ingredients: (movements || []).map(m => ({
                    name: m.ingredient_name,
                    unit: m.unit || m.product?.unit || '',
                    quantity: Math.abs(Number(m.quantity)),
                    stock_before: m.stock_before,
                    stock_after: m.stock_after
                }))
            });
        }

        res.json(usagesWithDetails);
    } catch (error) {
        console.error('❌ Erreur GET /ingredient-usages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete usage by ID
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression de l'utilisation d'ingrédients: ${id}`);

        // Fetch usage group
        const { data: usage, error: getUsageErr } = await supabase
            .from('ingredient_usage_groups')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getUsageErr) throw getUsageErr;
        if (!usage) {
            console.warn(`[Delete] Utilisation non trouvée: ${id}`);
            return res.status(404).json({ error: 'Utilisation non trouvée' });
        }

        // Get movements to restore stock
        const { data: movements, error: getMovsErr } = await supabase
            .from('ingredient_movements')
            .select('*')
            .ilike('notes', `%${usage.reference}%`)
            .eq('movement_type', 'usage');

        if (getMovsErr) throw getMovsErr;

        // Restore stock for each ingredient
        for (const movement of movements || []) {
            if (movement.ingredient_id) {
                const { data: ingredient, error: getIngErr } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', movement.ingredient_id)
                    .maybeSingle();

                if (getIngErr) throw getIngErr;

                if (ingredient) {
                    // Restore stock (add back the quantity that was used)
                    const restoredStock = Number(ingredient.stock) + Math.abs(Number(movement.quantity));
                    await supabase
                        .from('products')
                        .update({ stock: restoredStock })
                        .eq('id', movement.ingredient_id);
                }
            }
        }

        // Delete movements
        const { error: delMovsErr } = await supabase
            .from('ingredient_movements')
            .delete()
            .ilike('notes', `%${usage.reference}%`)
            .eq('movement_type', 'usage');

        if (delMovsErr) throw delMovsErr;

        // Delete usage group
        const { error: delGroupErr } = await supabase
            .from('ingredient_usage_groups')
            .delete()
            .eq('id', id);

        if (delGroupErr) throw delGroupErr;

        console.log(`[Delete] Utilisation ${id} supprimée avec succès (stock restauré)`);
        res.json({ message: 'Utilisation supprimée avec succès', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /ingredient-usages/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
