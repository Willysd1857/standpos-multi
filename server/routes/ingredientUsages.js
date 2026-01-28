const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Generate reference USAGE-XXX-DDMMYYYY
function generateUsageReference() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateStr = `${day}${month}${year}`;

    // Get count for today
    const count = db.prepare(`
    SELECT COUNT(*) as count FROM ingredient_usage_groups
    WHERE date(created_at) = date('now')
  `).get().count;

    const sequence = String(count + 1).padStart(3, '0');
    return `USAGE-${sequence}-${dateStr}`;
}

// Create ingredient usage (multiple ingredients)
router.post('/', (req, res) => {
    try {
        const { ingredients, notes = '' } = req.body;

        if (!ingredients || ingredients.length === 0) {
            return res.status(400).json({ error: 'Au moins un ingrédient requis' });
        }

        // Start transaction
        const createUsage = db.transaction(() => {
            // Create usage group
            const groupId = uuidv4();
            const reference = generateUsageReference();

            db.prepare(`
        INSERT INTO ingredient_usage_groups (id, reference, notes)
        VALUES (?, ?, ?)
      `).run(groupId, reference, notes);

            const results = [];

            // Process each ingredient
            for (const item of ingredients) {
                const { ingredient_id, quantity } = item;

                if (!ingredient_id || !quantity || quantity <= 0) {
                    throw new Error('Données d\'ingrédient invalides');
                }

                // Get ingredient
                const ingredient = db.prepare('SELECT * FROM products WHERE id = ? AND is_ingredient = 1').get(ingredient_id);
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
                db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock_after, ingredient_id);

                // Create movement
                const movementId = uuidv4();
                db.prepare(`
          INSERT INTO ingredient_movements (id, ingredient_id, ingredient_name, movement_type, quantity, stock_before, stock_after, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(movementId, ingredient_id, ingredient.name, 'usage', -quantity, stock_before, stock_after, `Utilisation - ${reference}`);

                results.push({
                    name: ingredient.name,
                    quantity,
                    unit: ingredient.unit,
                    stock_before,
                    stock_after
                });
            }

            return { reference, groupId, results };
        });

        const result = createUsage();
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all usage groups
router.get('/', (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const usages = db.prepare(`
      SELECT * FROM ingredient_usage_groups
      ORDER BY created_at DESC
      LIMIT ?
    `).all(parseInt(limit));

        // Get ingredients for each usage
        const usagesWithDetails = usages.map(usage => {
            const movements = db.prepare(`
        SELECT * FROM ingredient_movements
        WHERE notes LIKE ? AND movement_type = 'usage'
        ORDER BY created_at
      `).all(`%${usage.reference}%`);

            return {
                ...usage,
                ingredients: movements.map(m => ({
                    name: m.ingredient_name,
                    quantity: Math.abs(m.quantity),
                    stock_before: m.stock_before,
                    stock_after: m.stock_after
                }))
            };
        });

        res.json(usagesWithDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete usage by ID
router.delete('/:id', (req, res) => {
    try {
        const usage = db.prepare('SELECT * FROM ingredient_usage_groups WHERE id = ?').get(req.params.id);
        if (!usage) {
            return res.status(404).json({ error: 'Utilisation non trouvée' });
        }

        // Get movements to restore stock
        const movements = db.prepare(`
            SELECT * FROM ingredient_movements
            WHERE notes LIKE ? AND movement_type = 'usage'
        `).all(`%${usage.reference}%`);

        // Start transaction to delete and restore stock
        const deleteUsage = db.transaction(() => {
            // Restore stock for each ingredient
            for (const movement of movements) {
                const ingredient = db.prepare('SELECT * FROM products WHERE id = ?').get(movement.ingredient_id);
                if (ingredient) {
                    // Restore stock (add back the quantity that was used)
                    const restoredStock = Number(ingredient.stock) + Math.abs(movement.quantity);
                    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(restoredStock, movement.ingredient_id);
                }
            }

            // Delete movements
            db.prepare(`
                DELETE FROM ingredient_movements
                WHERE notes LIKE ? AND movement_type = 'usage'
            `).run(`%${usage.reference}%`);

            // Delete usage group
            db.prepare('DELETE FROM ingredient_usage_groups WHERE id = ?').run(req.params.id);
        });

        deleteUsage();
        res.json({ message: 'Utilisation supprimée avec succès' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

