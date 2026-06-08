const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuid } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get all categories
router.get('/', async (req, res) => {
    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .order('order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(categories || []);
    } catch (error) {
        console.error('❌ Erreur GET /categories:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get category by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: category, error } = await supabase
            .from('categories')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        console.error(`❌ Erreur GET /categories/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Create category
router.post('/', async (req, res) => {
    try {
        console.log('[Post] Tentative de création de catégorie:', JSON.stringify(req.body));

        const {
            name,
            icon = 'default',
            color = '#2563eb',
            order = 0
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
        }

        const id = uuid();
        const finalOrder = parseInt(order, 10) || 0;

        console.log(`[Post] Données finales: id=${id}, name=${name}, icon=${icon}, color=${color}, order=${finalOrder}`);

        const { data: category, error } = await supabase
            .from('categories')
            .insert({
                id,
                name: name.trim(),
                icon: String(icon),
                color: String(color),
                order: finalOrder
            })
            .select()
            .single();

        if (error) throw error;

        console.log('[Post] Insertion réussie');

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'CREATE_CATEGORY',
            'category',
            id,
            { name: category.name, color: category.color }
        );

        res.status(201).json(category);
    } catch (error) {
        console.error('❌ Erreur POST /categories:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Update category
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        console.log(`[Put] Tentative de mise à jour de la catégorie ${id}:`, JSON.stringify(updates));

        // Sanitize updates
        if (updates.id) delete updates.id;
        if (updates.created_at) delete updates.created_at;
        if (updates.updated_at) delete updates.updated_at;

        if (updates.order !== undefined) {
            updates.order = parseInt(updates.order, 10) || 0;
        }
        if (updates.hidden_in_pos !== undefined) {
            updates.hidden_in_pos = !!updates.hidden_in_pos;
        }

        // Set updated_at to now
        updates.updated_at = new Date().toISOString();

        const { data: category, error } = await supabase
            .from('categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        console.log('[Put] Mise à jour réussie');

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'UPDATE_CATEGORY',
            'category',
            id,
            {
                name: category.name,
                updated_fields: Object.keys(updates)
            }
        );

        res.json(category);
    } catch (error) {
        console.error(`❌ Erreur PUT /categories/${req.params.id}:`, error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Delete category
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression de la catégorie: ${id}`);

        // Get category info before deletion
        const { data: category, error: getError } = await supabase
            .from('categories')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getError) throw getError;
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_CATEGORY',
            'category',
            id,
            { name: category.name }
        );

        console.log(`[Delete] Catégorie ${id} supprimée avec succès`);
        res.json({ message: 'Category deleted successfully', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /categories/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
