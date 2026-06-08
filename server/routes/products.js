const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Get all products
router.get('/', async (req, res) => {
    try {
        const { is_active } = req.query;
        let query = supabase.from('products').select('*');

        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }

        const { data: products, error } = await query.order('name', { ascending: true });

        if (error) throw error;
        
        // Fetch location-specific stock if a user is tied to a location
        const user = getUserFromRequest(req);
        if (user.location_id) {
            const { data: locationStocks } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', user.location_id);
                
            const stockMap = {};
            if (locationStocks) {
                locationStocks.forEach(ls => {
                    stockMap[ls.product_id] = ls;
                });
            }
            
            const updatedProducts = products.map(p => {
                const ls = stockMap[p.id];
                return {
                    ...p,
                    stock: ls ? ls.quantity : 0,
                    empty_packaging_qty: ls ? ls.empty_packaging_qty : 0,
                    empty_secondary_packaging_qty: ls ? ls.empty_secondary_packaging_qty : 0
                };
            });
            return res.json(updatedProducts);
        }

        // For admins, calculate the global sum of empty packagings
        const { data: allStocks } = await supabase.from('stock_by_location').select('*');
        const stockMapGlobal = {};
        if (allStocks) {
            allStocks.forEach(ls => {
                if (!stockMapGlobal[ls.product_id]) {
                    stockMapGlobal[ls.product_id] = {
                        empty_packaging_qty: 0,
                        empty_secondary_packaging_qty: 0
                    };
                }
                stockMapGlobal[ls.product_id].empty_packaging_qty += Number(ls.empty_packaging_qty || 0);
                stockMapGlobal[ls.product_id].empty_secondary_packaging_qty += Number(ls.empty_secondary_packaging_qty || 0);
            });
        }
        
        const adminProducts = products.map(p => {
            const ls = stockMapGlobal[p.id];
            return {
                ...p,
                empty_packaging_qty: ls ? ls.empty_packaging_qty : 0,
                empty_secondary_packaging_qty: ls ? ls.empty_secondary_packaging_qty : 0
            };
        });

        res.json(adminProducts);
    } catch (error) {
        console.error('❌ Erreur GET /products:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all recipes (for POS stock calculation) — must be before /:id
router.get('/recipes/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('recipes')
            .select(`
                *,
                raw_material:products!raw_material_id(
                    name,
                    unit,
                    stock
                )
            `);

        if (error) throw error;

        // Map relational data to flat object structure matching front-end expectations
        const formatted = (data || []).map(r => ({
            id: r.id,
            product_id: r.product_id,
            raw_material_id: r.raw_material_id,
            quantity_per_batch: r.quantity_per_batch,
            batch_size: r.batch_size,
            created_at: r.created_at,
            raw_material_name: r.raw_material?.name || '',
            raw_material_unit: r.raw_material?.unit || '',
            raw_material_stock: r.raw_material?.stock || 0
        }));

        res.json(formatted);
    } catch (error) {
        console.error('❌ Erreur GET /products/recipes/all:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get product by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error(`❌ Erreur GET /products/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get recipe for a product
router.get('/:id/recipe', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('recipes')
            .select(`
                *,
                raw_material:products!raw_material_id(
                    name,
                    unit,
                    stock
                )
            `)
            .eq('product_id', req.params.id);

        if (error) throw error;

        const formatted = (data || []).map(r => ({
            id: r.id,
            product_id: r.product_id,
            raw_material_id: r.raw_material_id,
            quantity_per_batch: r.quantity_per_batch,
            batch_size: r.batch_size,
            created_at: r.created_at,
            raw_material_name: r.raw_material?.name || '',
            raw_material_unit: r.raw_material?.unit || '',
            raw_material_stock: r.raw_material?.stock || 0
        }));

        res.json(formatted);
    } catch (error) {
        console.error(`❌ Erreur GET /products/${req.params.id}/recipe:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Save (replace) recipe for a product
router.post('/:id/recipe', async (req, res) => {
    try {
        const { id } = req.params;
        const { ingredients } = req.body; // [{ raw_material_id, quantity_per_batch, batch_size }]

        if (!Array.isArray(ingredients)) {
            return res.status(400).json({ error: 'ingredients must be an array' });
        }

        // Delete existing recipe rows
        const { error: deleteError } = await supabase
            .from('recipes')
            .delete()
            .eq('product_id', id);

        if (deleteError) throw deleteError;

        // Insert new recipe rows if there are any
        if (ingredients.length > 0) {
            const rowsToInsert = ingredients.map(ing => ({
                id: uuidv4(),
                product_id: id,
                raw_material_id: ing.raw_material_id,
                quantity_per_batch: Number(ing.quantity_per_batch),
                batch_size: Number(ing.batch_size)
            }));

            const { error: insertError } = await supabase
                .from('recipes')
                .insert(rowsToInsert);

            if (insertError) throw insertError;
        }

        // Fetch and format the newly saved recipe
        const { data, error: fetchError } = await supabase
            .from('recipes')
            .select(`
                *,
                raw_material:products!raw_material_id(
                    name,
                    unit,
                    stock
                )
            `)
            .eq('product_id', id);

        if (fetchError) throw fetchError;

        const formatted = (data || []).map(r => ({
            id: r.id,
            product_id: r.product_id,
            raw_material_id: r.raw_material_id,
            quantity_per_batch: r.quantity_per_batch,
            batch_size: r.batch_size,
            created_at: r.created_at,
            raw_material_name: r.raw_material?.name || '',
            raw_material_unit: r.raw_material?.unit || '',
            raw_material_stock: r.raw_material?.stock || 0
        }));

        res.json(formatted);
    } catch (error) {
        console.error(`❌ Erreur POST /products/${req.params.id}/recipe:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Create product
router.post('/', async (req, res) => {
    try {
        const id = uuidv4();
        const {
            name,
            category_id,
            price,
            cost_price = 0,
            stock = 0,
            min_stock = 5,
            image_url = '',
            is_active = true,
            is_ingredient = false,
            unit = 'pièces',
            track_stock = true,
            product_type = 'direct',
            has_packaging = false,
            bottle_deposit_price = 0,
            crate_deposit_price = 0,
            bottles_per_crate = 24
        } = req.body;

        const finalIsIngredient = product_type === 'raw_material' ? true : !!is_ingredient;

        const { data: product, error } = await supabase
            .from('products')
            .insert({
                id,
                name,
                category_id: category_id || null,
                price: Number(price),
                cost_price: Number(cost_price),
                stock: Number(stock),
                min_stock: Number(min_stock),
                image_url: image_url || null,
                is_active: !!is_active,
                is_ingredient: finalIsIngredient,
                unit,
                track_stock: !!track_stock,
                product_type,
                has_packaging: !!has_packaging,
                bottle_deposit_price: Number(bottle_deposit_price),
                crate_deposit_price: Number(crate_deposit_price),
                bottles_per_crate: Number(bottles_per_crate)
            })
            .select()
            .single();

        if (error) throw error;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'CREATE_PRODUCT',
            'product',
            id,
            {
                name: product.name,
                category_id: product.category_id,
                price: product.price,
                stock: product.stock,
                track_stock: product.track_stock
            }
        );

        res.status(201).json(product);
    } catch (error) {
        console.error('❌ Erreur POST /products:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        const user = getUserFromRequest(req);

        // Sanitize updates
        if (updates.id) delete updates.id;
        if (updates.created_at) delete updates.created_at;
        if (updates.updated_at) delete updates.updated_at;

        // Ensure proper boolean conversion
        if ('is_active' in updates) updates.is_active = !!updates.is_active;
        if ('is_ingredient' in updates) updates.is_ingredient = !!updates.is_ingredient;
        if ('track_stock' in updates) updates.track_stock = !!updates.track_stock;
        if ('has_packaging' in updates) updates.has_packaging = !!updates.has_packaging;
        if ('bottle_deposit_price' in updates) updates.bottle_deposit_price = Number(updates.bottle_deposit_price);
        if ('crate_deposit_price' in updates) updates.crate_deposit_price = Number(updates.crate_deposit_price);
        if ('bottles_per_crate' in updates) updates.bottles_per_crate = Number(updates.bottles_per_crate);

        if ('product_type' in updates) {
            updates.is_ingredient = updates.product_type === 'raw_material';
        }

        updates.updated_at = new Date().toISOString();

        // If user is a location manager and trying to update stock, intercept it
        let interceptedStockUpdate = null;
        if (user.location_id && 'stock' in updates) {
            interceptedStockUpdate = updates.stock;
            delete updates.stock; // Do not update global product stock
            delete updates.empty_packaging_qty;
            delete updates.empty_secondary_packaging_qty;
        }

        let product;
        if (Object.keys(updates).length > 1 || (Object.keys(updates).length === 1 && !updates.updated_at)) {
            const { data, error } = await supabase
                .from('products')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            product = data;
        } else {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            product = data;
        }

        // Update location stock if intercepted
        if (interceptedStockUpdate !== null) {
            const { data: locStock, error: locErr } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', user.location_id)
                .eq('product_id', id)
                .maybeSingle();
            if (locErr) throw locErr;

            let sblResult;
            if (locStock) {
                sblResult = await supabase
                    .from('stock_by_location')
                    .update({ quantity: interceptedStockUpdate })
                    .eq('id', locStock.id);
            } else {
                sblResult = await supabase
                    .from('stock_by_location')
                    .insert({
                        id: uuidv4(),
                        location_id: user.location_id,
                        product_id: id,
                        quantity: interceptedStockUpdate
                    });
            }
            if (sblResult.error) throw sblResult.error;
            product.stock = interceptedStockUpdate;
        }

        // Audit log
        createAuditLog(
            user.id,
            user.username,
            'UPDATE_PRODUCT',
            'product',
            id,
            {
                name: product.name,
                updated_fields: Object.keys(updates),
                interceptedStockUpdate
            },
            null,
            user.location_id
        );

        res.json(product);
    } catch (error) {
        console.error(`❌ Erreur PUT /products/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Delete product
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get product info before deletion for audit log
        const { data: product, error: getError } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getError) throw getError;
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_PRODUCT',
            'product',
            id,
            {
                name: product.name,
                category_id: product.category_id,
                price: product.price
            }
        );

        res.json({ message: 'Product deleted successfully', id });
    } catch (error) {
        console.error(`❌ Erreur DELETE /products/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
