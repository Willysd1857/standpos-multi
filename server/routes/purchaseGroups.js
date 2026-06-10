const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Cache the column-existence check so we only probe once per process
let _schemaCache = null;
async function checkColumns() {
    if (_schemaCache) return _schemaCache;
    try {
        const { data, error } = await supabase
            .from('purchase_groups')
            .select('location_id, reception_status')
            .limit(1);
        _schemaCache = { ok: !error, error: error?.message };
    } catch (e) {
        _schemaCache = { ok: false, error: e.message };
    }
    return _schemaCache;
}

// Get all purchase groups
router.get('/', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        const { reception_status, location_id } = req.query;

        // Detect if the schema has the new columns. If not, fall back gracefully.
        const schema = await checkColumns();
        const hasNewCols = schema.ok;

        let query = supabase
            .from('purchase_groups')
            .select('*, items:purchase_group_items(*)')
            .order('created_at', { ascending: false });

        if (hasNewCols) {
            if (reception_status) query = query.eq('reception_status', reception_status);
            if (location_id) query = query.eq('location_id', location_id);
            // Non-admin users only see groups destined to their location OR (no location) for admin/store flows
            if (user.role !== 'admin' && user.location_id) {
                query = query.or(`location_id.eq.${user.location_id},location_id.is.null`);
            }
        }

        const { data: groups, error } = await query;
        if (error) throw error;

        // Enrich with destination location name
        const locationIds = (groups || []).map(g => g.location_id).filter(Boolean);
        let locationsMap = {};
        if (locationIds.length) {
            const { data: locs } = await supabase
                .from('locations')
                .select('id, name, type')
                .in('id', locationIds);
            for (const l of (locs || [])) locationsMap[l.id] = l;
        }

        const enriched = (groups || []).map(g => ({
            ...g,
            destination: g.location_id ? (locationsMap[g.location_id] || null) : null
        }));

        res.json(enriched);
    } catch (error) {
        console.error('❌ Erreur GET /purchase-groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get purchase group by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: group, error } = await supabase
            .from('purchase_groups')
            .select('*, items:purchase_group_items(*)')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!group) {
            return res.status(404).json({ error: 'Purchase group not found' });
        }

        res.json(group);
    } catch (error) {
        console.error(`❌ Erreur GET /purchase-groups/${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Create purchase group
router.post('/', async (req, res) => {
    try {
        const groupId = uuidv4();
        const {
            supplier_id = null,
            supplier_name = '',
            payment_method = 'cash',
            payment_type = 'cash', // 'cash' | 'credit' | 'partial'
            paid_amount = 0,
            due_date = null,
            date,
            status = 'validated',
            notes = '',
            items,
            location_id = null,
            returned_bottles = 0,
            returned_crates = 0
        } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Items are required' });
        }

        if (!supplier_id) {
            return res.status(400).json({ error: 'Fournisseur obligatoire' });
        }

        // Calculate total
        const total_amount = items.reduce((sum, item) => {
            return sum + (Number(item.quantity) * Number(item.unit_price));
        }, 0);

        const paid = Number(paid_amount) || 0;
        const debt_amount = Math.max(0, total_amount - paid);

        // Generate reference: APRO-XXX-DDMMYYYY
        const today = new Date();
        const dayStr = String(today.getDate()).padStart(2, '0');
        const monthStr = String(today.getMonth() + 1).padStart(2, '0');
        const yearStr = today.getFullYear();
        const dateStr = `${dayStr}${monthStr}${yearStr}`;

        // Get count of today's purchase groups
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { count, error: countErr } = await supabase
            .from('purchase_groups')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startOfDay.toISOString());

        if (countErr) throw countErr;

        const sequentialNumber = ((count || 0) + 1).toString().padStart(3, '0');
        const reference = `APRO-${sequentialNumber}-${dateStr}`;

        // ── DECIDE: reception needed or direct stock? ──
        const user = getUserFromRequest(req);
        const schema = await checkColumns();
        const hasNewCols = schema.ok;

        // Auto-detect if any item is for a product with packaging
        let hasPackagingItems = false;
        const productIds = items.map(i => i.product_id).filter(Boolean);
        if (productIds.length) {
            const { data: prods } = await supabase
                .from('products')
                .select('id, has_packaging')
                .in('id', productIds);
            for (const p of (prods || [])) {
                if (p.has_packaging) { hasPackagingItems = true; break; }
            }
        }

        // The order needs reception if:
        //   - location_id is provided AND it differs from sender's location, OR
        //   - there are packaging items AND the sender has no location (admin purchasing for warehouse)
        // Otherwise (admin buying for their own store, non-packaging products): direct stock.
        let needsReception = false;
        let destinationId = location_id || null;
        let destinationIsStore = false;
        if (hasNewCols) {
            const senderLoc = user.location_id || null;
            if (destinationId && destinationId !== senderLoc) {
                needsReception = true;
            }

            // Determine the destination's type: only `store` (Magasin) destinations
            // should touch the global `products.stock`. Warehouse destinations must
            // ONLY update `stock_by_location` to keep Magasin stock isolated.
            if (destinationId) {
                const { data: destLoc } = await supabase
                    .from('locations')
                    .select('id, type')
                    .eq('id', destinationId)
                    .maybeSingle();
                destinationIsStore = destLoc?.type === 'store';
            } else {
                destinationIsStore = true; // No destination = legacy "Magasin direct"
            }

            if (!destinationId && hasPackagingItems) {
                // Admin without own location buying packaging products → send to "first warehouse" (Entrepôt 1)
                // Find first warehouse by name containing "entrepôt 1" or any warehouse
                const { data: wh } = await supabase
                    .from('locations')
                    .select('id, name, type')
                    .eq('type', 'warehouse')
                    .order('name')
                    .limit(1)
                    .maybeSingle();
                if (wh) {
                    destinationId = wh.id;
                    needsReception = true;
                }
            }
        }

        const effectiveStatus = needsReception ? 'in_transit' : 'validated';
        const receptionStatus = needsReception ? 'pending' : 'received';

        // Build insert object
        const insertObj = {
            id: groupId,
            reference,
            supplier_id,
            supplier_name,
            payment_method,
            payment_type,
            paid_amount: paid,
            debt_amount,
            due_date: due_date || null,
            date,
            status: effectiveStatus,
            total_amount,
            returned_bottles: Number(returned_bottles) || 0,
            returned_crates: Number(returned_crates) || 0,
            notes: notes || null
        };
        if (hasNewCols) {
            insertObj.location_id = destinationId;
            insertObj.reception_status = receptionStatus;
        }

        const { error: insertGroupErr } = await supabase
            .from('purchase_groups')
            .insert(insertObj);

        if (insertGroupErr) throw insertGroupErr;

        // Insert items and update stock
        for (const item of items) {
            const itemId = uuidv4();
            const itemTotal = Number(item.quantity) * Number(item.unit_price);

            // Get product unit
            let finalUnit = '';
            if (item.product_id) {
                const { data: prod } = await supabase
                    .from('products')
                    .select('unit')
                    .eq('id', item.product_id)
                    .maybeSingle();
                finalUnit = prod?.unit || '';
            }

            // Insert item
            const { error: insertItemErr } = await supabase
                .from('purchase_group_items')
                .insert({
                    id: itemId,
                    group_id: groupId,
                    product_id: item.product_id || null,
                    product_name: item.product_name,
                    unit: finalUnit || null,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price),
                    total: itemTotal
                });

            if (insertItemErr) throw insertItemErr;

            // Update stock ONLY if direct (no reception). For in_transit orders, stock is added at reception.
            if (!needsReception && item.product_id) {
                const { data: product } = await supabase
                    .from('products')
                    .select('stock, name')
                    .eq('id', item.product_id)
                    .maybeSingle();

                if (product) {
                    const currentStock = Number(product.stock) || 0;
                    const qtyToAdd = Number(item.quantity);
                    const newStock = currentStock + qtyToAdd;

                    // Only update the global `products.stock` if the destination
                    // is a `store` (Magasin). For warehouse destinations, the
                    // Magasin stock must remain unchanged — only the per-location
                    // stock is updated.
                    if (destinationIsStore) {
                        await supabase
                            .from('products')
                            .update({ stock: newStock })
                            .eq('id', item.product_id);
                    }

                    // Update stock_by_location
                    if (destinationId) {
                        const { data: locStock } = await supabase
                            .from('stock_by_location')
                            .select('quantity')
                            .eq('location_id', destinationId)
                            .eq('product_id', item.product_id)
                            .maybeSingle();

                        if (locStock) {
                            await supabase
                                .from('stock_by_location')
                                .update({ quantity: (Number(locStock.quantity) || 0) + qtyToAdd })
                                .eq('location_id', destinationId)
                                .eq('product_id', item.product_id);
                        } else {
                            await supabase
                                .from('stock_by_location')
                                .insert({
                                    id: uuidv4(),
                                    location_id: destinationId,
                                    product_id: item.product_id,
                                    quantity: qtyToAdd
                                });
                        }
                    }

                    // Record stock movement
                    await supabase
                        .from('stock_movements')
                        .insert({
                            id: uuidv4(),
                            product_id: item.product_id,
                            location_id: destinationId || null,
                            product_name: product.name,
                            movement_type: 'achat',
                            quantity: qtyToAdd,
                            stock_before: destinationIsStore ? currentStock : null,
                            stock_after: destinationIsStore ? newStock : null,
                            transaction_ref: reference,
                            notes: `Approvisionnement groupé: ${supplier_name || 'Fournisseur inconnu'}${destinationIsStore ? '' : ' [entrepôt — global products.stock inchangé]'}`
                        });
                }
            }
        }

        // Supplier: update debt and create supplier transaction
        let supplier = null;
        if (supplier_id) {
            const { data: sup } = await supabase
                .from('suppliers')
                .select('*')
                .eq('id', supplier_id)
                .maybeSingle();
            supplier = sup;
        }

        if (supplier) {
            const newDebt = (Number(supplier.total_debt) || 0) + debt_amount;
            await supabase
                .from('suppliers')
                .update({
                    total_debt: newDebt,
                    updated_at: new Date().toISOString()
                })
                .eq('id', supplier_id);

            // Create supplier_transactions record
            await supabase.from('supplier_transactions').insert({
                id: uuidv4(),
                supplier_id,
                location_id: destinationId || null,
                type: 'purchase',
                reference,
                total_amount,
                paid_amount: paid,
                debt_amount,
                payment_method,
                date: date || new Date().toISOString().split('T')[0],
                due_date: due_date || null,
                notes: notes || `Approvisionnement groupé ${reference}`
            });
        }

        // Handle returned packaging: deduct from stock + record as packaging_return transaction
        const rb = Number(returned_bottles) || 0;
        const rc = Number(returned_crates) || 0;
        if (rb > 0 || rc > 0) {
            // Deduct from each product's empty_packaging_qty (proportionally across items that have packaging)
            const packagingItems = items.filter(i => i.product_id);
            if (packagingItems.length > 0) {
                const totalQty = packagingItems.reduce((s, i) => s + Number(i.quantity), 0);
                let remainingB = rb;
                let remainingC = rc;
                for (let idx = 0; idx < packagingItems.length; idx++) {
                    const item = packagingItems[idx];
                    const isLast = idx === packagingItems.length - 1;
                    const bDeduct = isLast ? remainingB : Math.round((Number(item.quantity) / totalQty) * rb);
                    const cDeduct = isLast ? remainingC : Math.round((Number(item.quantity) / totalQty) * rc);
                    remainingB -= bDeduct;
                    remainingC -= cDeduct;

                    if (bDeduct > 0 || cDeduct > 0) {
                        // Fetch product name for movement log
                        const { data: pkgProduct } = await supabase
                            .from('products')
                            .select('name')
                            .eq('id', item.product_id)
                            .maybeSingle();

                        if (destinationId) {
                            const { data: locStock } = await supabase
                                .from('stock_by_location')
                                .select('*')
                                .eq('location_id', destinationId)
                                .eq('product_id', item.product_id)
                                .maybeSingle();
                            if (locStock) {
                                await supabase
                                    .from('stock_by_location')
                                    .update({
                                        empty_packaging_qty: Math.max(0, (Number(locStock.empty_packaging_qty) || 0) - bDeduct),
                                        empty_secondary_packaging_qty: Math.max(0, (Number(locStock.empty_secondary_packaging_qty) || 0) - cDeduct)
                                    })
                                    .eq('id', locStock.id);
                            }
                        }
                        // Record packaging movement
                        await supabase.from('packaging_movements').insert({
                            id: uuidv4(),
                            location_id: destinationId || null,
                            product_id: item.product_id,
                            product_name: pkgProduct?.name || item.product_name || 'Produit inconnu',
                            movement_type: 'supplier_return',
                            empty_packaging_qty: bDeduct,
                            empty_secondary_packaging_qty: cDeduct,
                            source_type: 'purchase',
                            notes: `Retour fournisseur - Approvisionnement ${reference}`,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }

            // Record packaging_return supplier transaction (tracking outstanding)
            if (supplier) {
                await supabase.from('supplier_transactions').insert({
                    id: uuidv4(),
                    supplier_id,
                    location_id: destinationId || null,
                    type: 'packaging_return',
                    reference,
                    total_amount: 0,
                    paid_amount: 0,
                    debt_amount: 0,
                    payment_method: 'packaging',
                    date: date || new Date().toISOString().split('T')[0],
                    notes: `Retour emballages: ${rb} bouteille(s), ${rc} cageot(s)`
                });
            }
        }

        // Fetch the created group with items
        const { data: group, error: fetchErr } = await supabase
            .from('purchase_groups')
            .select('*, items:purchase_group_items(*)')
            .eq('id', groupId)
            .single();

        if (fetchErr) throw fetchErr;

        // Audit log
        createAuditLog(
            user.id,
            user.username,
            'CREATE_PURCHASE_GROUP',
            'purchase_group',
            groupId,
            {
                reference: group.reference,
                supplier_id,
                supplier: group.supplier_name,
                total_amount: group.total_amount,
                paid_amount: paid,
                debt_amount,
                payment_type,
                items_count: group.items.length,
                returned_bottles: rb,
                returned_crates: rc,
                needs_reception: needsReception,
                destination_id: destinationId,
                reception_status: hasNewCols ? receptionStatus : 'n/a'
            },
            req.ip,
            user.location_id
        );

        res.status(201).json({
            ...group,
            needs_reception: needsReception,
            reception_status: hasNewCols ? receptionStatus : 'received',
            destination_id: destinationId,
        });
    } catch (error) {
        console.error('❌ Error creating purchase group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Receive a purchase group (only by recipient admin/stock_manager at the destination)
router.post('/:id/receive', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        const { id } = req.params;

        // Check schema
        const schema = await checkColumns();
        if (!schema.ok) {
            return res.status(503).json({
                error: 'Schéma manquant: les colonnes location_id et reception_status doivent être ajoutées à purchase_groups. Exécutez server/migration_2026_06_01_purchase_groups_reception.sql'
            });
        }

        // Fetch the group
        const { data: group, error: fetchErr } = await supabase
            .from('purchase_groups')
            .select('*, items:purchase_group_items(*)')
            .eq('id', id)
            .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!group) return res.status(404).json({ error: 'Commande introuvable' });

        // Authorize: only admin OR a user whose location_id matches the destination
        const isAdmin = user.role === 'admin';
        const isAtDestination = user.location_id && group.location_id && user.location_id === group.location_id;
        if (!isAdmin && !isAtDestination) {
            return res.status(403).json({ error: 'Vous ne pouvez réceptionner que les commandes destinées à votre emplacement.' });
        }

        if (group.reception_status === 'received') {
            return res.status(400).json({ error: 'Cette commande a déjà été réceptionnée.' });
        }

        // Determine destination location type — only `store` (Magasin) destinations
        // should touch the global `products.stock`. Warehouse destinations must
        // ONLY update `stock_by_location` to avoid double-counting.
        let destinationIsStore = false;
        if (group.location_id) {
            const { data: destLoc } = await supabase
                .from('locations')
                .select('id, type')
                .eq('id', group.location_id)
                .maybeSingle();
            destinationIsStore = destLoc?.type === 'store';
        }

        // Add stock to the destination location for each item
        for (const item of (group.items || [])) {
            if (!item.product_id) continue;
            const { data: product } = await supabase
                .from('products')
                .select('stock, name')
                .eq('id', item.product_id)
                .maybeSingle();
            if (!product) continue;

            const qty = Number(item.quantity) || 0;
            const currentStock = Number(product.stock) || 0;
            const newStock = currentStock + qty;

            // Only update the global `products.stock` if the destination is a
            // `store` (Magasin). For warehouse destinations, the Magasin stock
            // must remain unchanged — only the per-location stock is updated.
            if (destinationIsStore) {
                await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
            }

            // stock_by_location
            const { data: locStock } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', group.location_id)
                .eq('product_id', item.product_id)
                .maybeSingle();
            if (locStock) {
                await supabase.from('stock_by_location').update({
                    quantity: (Number(locStock.quantity) || 0) + qty,
                    updated_at: new Date().toISOString()
                }).eq('id', locStock.id);
            } else {
                await supabase.from('stock_by_location').insert({
                    id: uuidv4(),
                    location_id: group.location_id,
                    product_id: item.product_id,
                    quantity: qty
                });
            }

            // Stock movement
            await supabase.from('stock_movements').insert({
                id: uuidv4(),
                product_id: item.product_id,
                location_id: group.location_id,
                product_name: product.name,
                movement_type: 'reception',
                quantity: qty,
                stock_before: destinationIsStore ? currentStock : null,
                stock_after: destinationIsStore ? newStock : null,
                transaction_ref: group.reference,
                notes: `Réception commande ${group.reference}${destinationIsStore ? '' : ' [entrepôt — global products.stock inchangé]'}`
            });
        }

        // Mark as received
        await supabase.from('purchase_groups').update({
            reception_status: 'received',
            status: 'validated',
            received_at: new Date().toISOString(),
            received_by: user.id,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        // Audit
        createAuditLog(
            user.id,
            user.username,
            'RECEIVE_PURCHASE_GROUP',
            'purchase_group',
            id,
            {
                reference: group.reference,
                destination_id: group.location_id,
                items_count: (group.items || []).length
            },
            req.ip,
            user.location_id
        );

        res.json({
            success: true,
            message: 'Commande réceptionnée et stock ajouté.',
            group_id: id
        });
    } catch (error) {
        console.error('❌ Erreur POST /purchase-groups/:id/receive:', error);
        res.status(500).json({ error: error.message });
    }
});
// Delete purchase group
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression du groupe d'achat: ${id}`);

        // Fetch group with items
        const { data: group, error: fetchErr } = await supabase
            .from('purchase_groups')
            .select('*, items:purchase_group_items(*)')
            .eq('id', id)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!group) {
            console.warn(`[Delete] Groupe d'achat non trouvé: ${id}`);
            return res.status(404).json({ error: 'Purchase group not found' });
        }

        // Reverse stock if status was validated
        if (group.status === 'validated' && group.items) {
            for (const item of group.items) {
                if (item.product_id) {
                    const { data: product } = await supabase
                        .from('products')
                        .select('stock, name')
                        .eq('id', item.product_id)
                        .maybeSingle();

                    if (product) {
                        const currentStock = Number(product.stock) || 0;
                        const qtyToSub = Number(item.quantity);
                        const newStock = currentStock - qtyToSub;

                        await supabase
                            .from('products')
                            .update({ stock: newStock })
                            .eq('id', item.product_id);

                        // Record stock movement (reverse)
                        await supabase
                            .from('stock_movements')
                            .insert({
                                id: uuidv4(),
                                product_id: item.product_id,
                                product_name: product.name,
                                movement_type: 'annulation',
                                quantity: -qtyToSub,
                                stock_before: currentStock,
                                stock_after: newStock,
                                transaction_ref: group.reference,
                                notes: `Annulation approvisionnement groupé`
                            });
                    }
                }
            }
        }

        // Delete group (cascade constraint in DB deletes items automatically)
        const { error: deleteErr } = await supabase
            .from('purchase_groups')
            .delete()
            .eq('id', id);

        if (deleteErr) throw deleteErr;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_PURCHASE_GROUP',
            'purchase_group',
            id,
            {
                reference: group.reference,
                total_amount: group.total_amount
            }
        );

        console.log(`[Delete] Groupe d'achat ${id} et ses articles supprimés avec succès`);
        res.json({ message: 'Purchase group deleted successfully', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /purchase-groups/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
