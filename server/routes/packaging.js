const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { getUserFromRequest, createAuditLog } = require('../middleware/auditLogger');
const { tryWithOptionalColumn } = require('../services/degradedMode');

// Get customer consignments summary
router.get('/customer-summary', async (req, res) => {
    try {
        const { data: consignments, error } = await supabase
            .from('packaging_consignments')
            .select('*')
            .eq('entity_type', 'customer')
            .eq('status', 'pending');

        if (error) throw error;

        // Group by product
        const summary = {};
        for (const c of consignments || []) {
            if (!summary[c.product_id]) {
                summary[c.product_id] = {
                    product_id: c.product_id,
                    product_name: c.product_name,
                    total_bottles: 0,
                    total_crates: 0,
                    total_deposit_value: 0
                };
            }
            summary[c.product_id].total_bottles += Number(c.empty_packaging_qty) || 0;
            summary[c.product_id].total_crates += Number(c.empty_secondary_packaging_qty) || 0;
            const itemValue = ((Number(c.empty_packaging_qty) || 0) * (Number(c.packaging_deposit_value) || 0)) +
                              ((Number(c.empty_secondary_packaging_qty) || 0) * (Number(c.secondary_packaging_deposit_value) || 0));
            summary[c.product_id].total_deposit_value += itemValue;
        }

        res.json(Object.values(summary));
    } catch (error) {
        console.error('❌ Erreur GET /packaging/customer-summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// Return customer packaging (Refund cash and increment empty stock)
router.post('/customer-return', async (req, res) => {
    try {
        const { product_id, customer_id, return_bottles, return_crates } = req.body;
        const user = getUserFromRequest(req);
        const bottlesToReturn = Number(return_bottles) || 0;
        const cratesToReturn = Number(return_crates) || 0;

        if (bottlesToReturn <= 0 && cratesToReturn <= 0) {
            return res.status(400).json({ error: 'Rien à retourner' });
        }

        // 1. Fetch pending consignments for this product (+customer if specified), oldest first
        let q = supabase
            .from('packaging_consignments')
            .select('*')
            .eq('entity_type', 'customer')
            .eq('product_id', product_id)
            .in('status', ['pending', 'partial'])
            .order('created_at', { ascending: true });
        if (customer_id) q = q.eq('entity_id', customer_id);
        const { data: consignments, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;

        let remainingBottlesToReturn = bottlesToReturn;
        let remainingCratesToReturn = cratesToReturn;
        let totalRefund = 0;
        const affectedCustomers = new Set();

        // 2. Loop through consignments (FIFO) and deduct
        for (const c of consignments || []) {
            if (remainingBottlesToReturn <= 0 && remainingCratesToReturn <= 0) break;

            const bAvail = Number(c.empty_packaging_qty) || 0;
            const cAvail = Number(c.empty_secondary_packaging_qty) || 0;

            const bReturn = Math.min(bAvail, remainingBottlesToReturn);
            const cReturn = Math.min(cAvail, remainingCratesToReturn);

            const newBAvail = bAvail - bReturn;
            const newCAvail = cAvail - cReturn;

            remainingBottlesToReturn -= bReturn;
            remainingCratesToReturn -= cReturn;

            totalRefund += (bReturn * (Number(c.packaging_deposit_value) || 0)) +
                           (cReturn * (Number(c.secondary_packaging_deposit_value) || 0));

            const newStatus = (newBAvail === 0 && newCAvail === 0) ? 'returned' : 'pending';

            await supabase
                .from('packaging_consignments')
                .update({
                    empty_packaging_qty: newBAvail,
                    empty_secondary_packaging_qty: newCAvail,
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', c.id);

            if (bReturn > 0 || cReturn > 0) affectedCustomers.add(c.entity_id);
        }

        // 3. Fetch product info (for movement log)
        const { data: product } = await supabase
            .from('products')
            .select('name, location_id')
            .eq('id', product_id)
            .maybeSingle();

        // ✅ AUGMENTER LE STOCK PHYSIQUE du Magasin (per-location)
        //    On prend la location de la première consigne affectée, ou à
        //    défaut la location de l'utilisateur. UPSERT garanti.
        const stockLocationId = (consignments && consignments[0]?.location_id) || user.location_id;
        if (stockLocationId) {
            const { data: sbl } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', stockLocationId)
                .eq('product_id', product_id)
                .maybeSingle();
            const tsNow = new Date().toISOString();
            if (sbl) {
                await supabase.from('stock_by_location').update({
                    empty_packaging_qty: Math.max(0, (Number(sbl.empty_packaging_qty) || 0) + bottlesToReturn),
                    empty_secondary_packaging_qty: Math.max(0, (Number(sbl.empty_secondary_packaging_qty) || 0) + cratesToReturn),
                    updated_at: tsNow
                }).eq('id', sbl.id);
            } else {
                await supabase.from('stock_by_location').insert({
                    id: uuidv4(),
                    location_id: stockLocationId,
                    product_id,
                    quantity: 0,
                    empty_packaging_qty: Math.max(0, bottlesToReturn),
                    empty_secondary_packaging_qty: Math.max(0, cratesToReturn),
                    updated_at: tsNow
                });
            }
        }

        // Movement
        if (product) {
            await supabase.from('packaging_movements').insert({
                id: uuidv4(),
                location_id: stockLocationId || null,
                product_id,
                product_name: product.name,
                movement_type: 'consignment_return',
                empty_packaging_qty: bottlesToReturn,
                empty_secondary_packaging_qty: cratesToReturn,
                source_type: 'manual',
                notes: `Retour consigne client. Remboursement: ${totalRefund} Ar`,
                created_at: new Date().toISOString()
            });
        }

        // ✅ DIMINUER LA DETTE D'EMBALLAGES des clients impactés (FIFO)
        for (const entityId of affectedCustomers) {
            // entity_id peut être id (PK) OU customer_id (CLI-001)
            let cust = null;
            const { data: c1 } = await supabase
                .from('customers')
                .select('id, packaging_debt_bottles, packaging_debt_crates')
                .eq('id', entityId)
                .maybeSingle();
            if (c1) cust = c1;
            else {
                const { data: c2 } = await supabase
                    .from('customers')
                    .select('id, packaging_debt_bottles, packaging_debt_crates')
                    .eq('customer_id', entityId)
                    .maybeSingle();
                cust = c2;
            }
            if (cust) {
                // On décrémente proportionnellement aux quantités réellement
                // retournées sur les consignes de ce client. La somme des
                // décréments est plafonnée à bottlesToReturn/cratesToReturn
                // par construction (FIFO ci-dessus).
                await supabase.from('customers').update({
                    packaging_debt_bottles: Math.max(0, (Number(cust.packaging_debt_bottles) || 0) - bottlesToReturn),
                    packaging_debt_crates: Math.max(0, (Number(cust.packaging_debt_crates) || 0) - cratesToReturn),
                    updated_at: new Date().toISOString()
                }).eq('id', cust.id);
            }
        }

        // 4. Refund transaction
        if (totalRefund > 0) {
            const ts = new Date();
            const dateStr = `${ts.getDate().toString().padStart(2, '0')}${(ts.getMonth() + 1).toString().padStart(2, '0')}${ts.getFullYear()}`;
            await supabase.from('transactions').insert({
                id: uuidv4(),
                reference: `REMBOURSEMENT-CONS-${dateStr}-${Math.floor(Math.random() * 1000)}`,
                type: 'remboursement_consigne',
                items: JSON.stringify([{ product_id, name: `Remboursement Consigne ${product?.name}`, quantity: 1, price: -totalRefund }]),
                total_amount: -totalRefund,
                amount_paid: -totalRefund,
                amount_due: 0,
                payment_method: 'cash',
                status: 'validated',
                payment_status: 'paid',
                created_at: ts.toISOString(),
                updated_at: ts.toISOString()
            });
        }

        createAuditLog(
            user.id, user.username,
            'RETURN_CUSTOMER_CONSIGNMENT_FIFO',
            'product', product_id,
            {
                product_name: product?.name,
                bottles_returned: bottlesToReturn,
                crates_returned: cratesToReturn,
                refunded: totalRefund,
                affected_customers: Array.from(affectedCustomers)
            },
            req.ip, user.location_id
        );

        res.json({
            success: true,
            refundedAmount: totalRefund,
            bottlesReturned: bottlesToReturn,
            cratesReturned: cratesToReturn
        });
    } catch (error) {
        console.error('❌ Erreur POST /packaging/customer-return:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all packaging history/movements
router.get('/history', async (req, res) => {
    try {
        const { type, start_date, end_date } = req.query;
        let query = supabase.from('packaging_movements').select('*');

        if (type) query = query.eq('movement_type', type);
        if (start_date && end_date) {
            query = query.gte('created_at', `${start_date}T00:00:00.000Z`).lte('created_at', `${end_date}T23:59:59.999Z`);
        }

        const { data: history, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(history || []);
    } catch (error) {
        console.error('❌ Erreur GET /packaging/history:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get consignments
router.get('/consignments', async (req, res) => {
    try {
        const { entity_type } = req.query;
        let query = supabase.from('packaging_consignments').select('*').order('created_at', { ascending: false });

        if (entity_type) {
            query = query.eq('entity_type', entity_type);
        }

        const { data: consignments, error } = await query;

        if (error) {
            console.error('❌ Erreur GET /packaging/consignments:', error.message, error);
            throw error;
        }

        console.log('📋 [consignments] Found:', consignments?.length || 0, 'entity_type:', entity_type || 'all');
        res.json(consignments || []);
    } catch (error) {
        console.error('❌ Erreur GET /packaging/consignments:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Outstanding packaging to return to suppliers ────────────────
// Primary source: packaging_consignments (entity_type='supplier', status='pending')
// Fallback: packaging_movements (for cases without verify-reception checklist)
router.get('/supplier-outstanding', async (req, res) => {
    try {
        // 1. PRIMARY: Read from packaging_consignments (authoritative source)
        const { data: consignments, error: consErr } = await supabase
            .from('packaging_consignments')
            .select('*')
            .eq('entity_type', 'supplier')
            .in('status', ['pending', 'partial']);

        if (consErr) {
            console.error('❌ Erreur fetch consignments for supplier-outstanding:', consErr.message, consErr);
            throw consErr;
        }

        console.log('📋 [supplier-outstanding] Consignments found:', consignments?.length || 0);
        for (const c of consignments || []) {
            console.log(`  → ${c.entity_name} (${c.entity_id}): ${c.product_name} qty=${c.empty_packaging_qty} status=${c.status}`);
        }

        // Group by supplier+product, summing outstanding quantities
        const outstanding = {};
        for (const c of consignments || []) {
            const key = `${c.entity_id}::${c.product_id}`;
            if (!outstanding[key]) {
                outstanding[key] = {
                    supplier_id: c.entity_id,
                    supplier_name: c.entity_name || 'Fournisseur inconnu',
                    product_id: c.product_id,
                    product_name: c.product_name || 'Produit inconnu',
                    empty_packaging_qty: 0,
                    empty_secondary_packaging_qty: 0,
                    purchase_ref: c.source_transaction_id || null,
                    created_at: c.created_at || null
                };
            }
            outstanding[key].empty_packaging_qty += Number(c.empty_packaging_qty) || 0;
            outstanding[key].empty_secondary_packaging_qty += Number(c.empty_secondary_packaging_qty) || 0;
        }

        // 2. FALLBACK: Read from packaging_movements (for direct purchases without verify-reception)
        //    Only add items NOT already covered by consignments
        const { data: movements, error: movErr } = await supabase
            .from('packaging_movements')
            .select('*')
            .in('movement_type', ['in', 'supplier_return']);

        if (movErr) throw movErr;

        // Get purchase groups to resolve supplier_id from source_id
        const purchaseIds = [...new Set(
            (movements || [])
                .filter(m => m.source_type === 'purchase' && m.source_id)
                .map(m => m.source_id)
        )];

        let purchaseGroups = [];
        if (purchaseIds.length > 0) {
            for (let i = 0; i < purchaseIds.length; i += 100) {
                const batch = purchaseIds.slice(i, i + 100);
                const { data: batchData } = await supabase
                    .from('purchase_groups')
                    .select('id, supplier_id, supplier_name, reference, created_at')
                    .in('id', batch);
                if (batchData) purchaseGroups.push(...batchData);
            }
        }

        const pgLookup = {};
        for (const pg of purchaseGroups) {
            pgLookup[pg.id] = pg;
        }

        // Process movements as fallback
        const movementOutstanding = {};
        for (const m of movements || []) {
            const pgInfo = m.source_type === 'purchase' ? pgLookup[m.source_id] : null;
            const supplierId = pgInfo?.supplier_id || 'unknown';
            const supplierName = pgInfo?.supplier_name || 'Fournisseur inconnu';
            const productId = m.product_id;
            const key = `${supplierId}::${productId}`;

            if (!movementOutstanding[key]) {
                movementOutstanding[key] = {
                    supplier_id: supplierId,
                    supplier_name: supplierName,
                    product_id: productId,
                    product_name: m.product_name || 'Produit inconnu',
                    received_bottles: 0,
                    received_crates: 0,
                    returned_bottles: 0,
                    returned_crates: 0,
                    purchase_ref: pgInfo?.reference || null,
                    created_at: pgInfo?.created_at || m.created_at || null
                };
            }

            const bottles = Number(m.empty_packaging_qty) || 0;
            const crates = Number(m.empty_secondary_packaging_qty) || 0;

            if (m.movement_type === 'in') {
                movementOutstanding[key].received_bottles += bottles;
                movementOutstanding[key].received_crates += crates;
            } else if (m.movement_type === 'supplier_return') {
                movementOutstanding[key].returned_bottles += bottles;
                movementOutstanding[key].returned_crates += crates;
            }
        }

        // Merge: only add movement items NOT already in consignments
        for (const key of Object.keys(movementOutstanding)) {
            if (outstanding[key]) continue; // already covered by consignments
            const mo = movementOutstanding[key];
            const outstandingBottles = mo.received_bottles - mo.returned_bottles;
            const outstandingCrates = mo.received_crates - mo.returned_crates;
            if (outstandingBottles <= 0 && outstandingCrates <= 0) continue; // fully returned
            outstanding[key] = {
                supplier_id: mo.supplier_id,
                supplier_name: mo.supplier_name,
                product_id: mo.product_id,
                product_name: mo.product_name,
                empty_packaging_qty: outstandingBottles,
                empty_secondary_packaging_qty: outstandingCrates,
                purchase_ref: mo.purchase_ref,
                created_at: mo.created_at
            };
        }

        // 3. Build result
        const result = Object.entries(outstanding).map(([key, o]) => ({
            id: key,
            supplier_id: o.supplier_id,
            entity_name: o.supplier_name,
            product_id: o.product_id,
            product_name: o.product_name,
            empty_packaging_qty: o.empty_packaging_qty,
            empty_secondary_packaging_qty: o.empty_secondary_packaging_qty,
            source_reference: o.purchase_ref,
            created_at: o.created_at,
            status: 'pending'
        }));

        // Sort by most recent first
        result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        console.log('📊 [supplier-outstanding] Final result:', result.length, 'items');
        for (const r of result) {
            console.log(`  → ${r.entity_name}: ${r.empty_packaging_qty} bottles, ${r.empty_secondary_packaging_qty} crates`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ Erreur GET /packaging/supplier-outstanding:', error);
        res.status(500).json({ error: error.message });
    }
});

// Return a specific consignment
router.post('/consignments/:id/return', async (req, res) => {
    try {
        const { id } = req.params;
        const { return_bottles, return_crates } = req.body;
        const user = getUserFromRequest(req);

        const { data: consignment, error: getErr } = await supabase
            .from('packaging_consignments')
            .select('*')
            .eq('id', id)
            .single();

        if (getErr) throw getErr;
        if (!consignment) return res.status(404).json({ error: 'Consignment not found' });

        const bReturn = Math.min(Number(consignment.empty_packaging_qty) || 0, Number(return_bottles) || 0);
        const cReturn = Math.min(Number(consignment.empty_secondary_packaging_qty) || 0, Number(return_crates) || 0);

        if (bReturn <= 0 && cReturn <= 0) return res.status(400).json({ error: 'Rien à retourner' });

        const newBAvail = (Number(consignment.empty_packaging_qty) || 0) - bReturn;
        const newCAvail = (Number(consignment.empty_secondary_packaging_qty) || 0) - cReturn;
        const newStatus = (newBAvail === 0 && newCAvail === 0) ? 'returned' : 'partial';

        // Update consignment
        await supabase.from('packaging_consignments').update({
            empty_packaging_qty: newBAvail,
            empty_secondary_packaging_qty: newCAvail,
            status: newStatus,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        // Fetch product name (for movement log)
        const { data: product } = await supabase.from('products').select('name').eq('id', consignment.product_id).single();

        // ✅ AUGMENTER LE STOCK PHYSIQUE du Magasin (per-location)
        //    La consigne sortante avait été débitée du stock du Magasin à la
        //    création (cf. transactions.js). Au retour, on l'incrémente.
        const stockLocationId = consignment.location_id || user.location_id;
        if (stockLocationId) {
            const { data: sbl } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', stockLocationId)
                .eq('product_id', consignment.product_id)
                .maybeSingle();
            const tsNow = new Date().toISOString();
            if (sbl) {
                await supabase.from('stock_by_location').update({
                    empty_packaging_qty: Math.max(0, (Number(sbl.empty_packaging_qty) || 0) + bReturn),
                    empty_secondary_packaging_qty: Math.max(0, (Number(sbl.empty_secondary_packaging_qty) || 0) + cReturn),
                    updated_at: tsNow
                }).eq('id', sbl.id);
            } else {
                await supabase.from('stock_by_location').insert({
                    id: uuidv4(),
                    location_id: stockLocationId,
                    product_id: consignment.product_id,
                    quantity: 0,
                    empty_packaging_qty: Math.max(0, bReturn),
                    empty_secondary_packaging_qty: Math.max(0, cReturn),
                    updated_at: tsNow
                });
            }
        }

        // Movement
        if (product) {
            await supabase.from('packaging_movements').insert({
                id: uuidv4(),
                location_id: stockLocationId || null,
                product_id: consignment.product_id,
                product_name: product.name,
                movement_type: 'consignment_return',
                empty_packaging_qty: bReturn,
                empty_secondary_packaging_qty: cReturn,
                source_type: 'manual',
                notes: `Retour direct consigne ${consignment.entity_name}`,
                created_at: new Date().toISOString()
            });
        }

        // ✅ DIMINUER LA DETTE D'EMBALLAGES DU CLIENT
        if (consignment.entity_type === 'customer' && consignment.entity_id && (bReturn > 0 || cReturn > 0)) {
            const { data: cust } = await supabase
                .from('customers')
                .select('id, packaging_debt_bottles, packaging_debt_crates')
                .eq('id', consignment.entity_id)
                .maybeSingle();
            if (cust) {
                await supabase.from('customers').update({
                    packaging_debt_bottles: Math.max(0, (Number(cust.packaging_debt_bottles) || 0) - bReturn),
                    packaging_debt_crates: Math.max(0, (Number(cust.packaging_debt_crates) || 0) - cReturn),
                    updated_at: new Date().toISOString()
                }).eq('id', cust.id);
            } else {
                // entity_id is a customer_id (e.g. "CLI-001"), not the row PK
                const { data: cust2 } = await supabase
                    .from('customers')
                    .select('id, packaging_debt_bottles, packaging_debt_crates')
                    .eq('customer_id', consignment.entity_id)
                    .maybeSingle();
                if (cust2) {
                    await supabase.from('customers').update({
                        packaging_debt_bottles: Math.max(0, (Number(cust2.packaging_debt_bottles) || 0) - bReturn),
                        packaging_debt_crates: Math.max(0, (Number(cust2.packaging_debt_crates) || 0) - cReturn),
                        updated_at: new Date().toISOString()
                    }).eq('id', cust2.id);
                }
            }
        }

        // Financial refund
        const totalRefund = (bReturn * (Number(consignment.packaging_deposit_value) || 0)) + (cReturn * (Number(consignment.secondary_packaging_deposit_value) || 0));
        if (totalRefund > 0) {
            const ts = new Date();
            const dateStr = `${ts.getDate().toString().padStart(2, '0')}${(ts.getMonth() + 1).toString().padStart(2, '0')}${ts.getFullYear()}`;
            await supabase.from('transactions').insert({
                id: uuidv4(),
                reference: `REMBOURSEMENT-CONS-${dateStr}-${Math.floor(Math.random() * 1000)}`,
                type: 'remboursement_consigne',
                items: JSON.stringify([{ product_id: consignment.product_id, name: `Remboursement Consigne ${product?.name}`, quantity: 1, price: -totalRefund }]),
                total_amount: -totalRefund,
                amount_paid: -totalRefund,
                amount_due: 0,
                payment_method: 'cash',
                status: 'validated',
                payment_status: 'paid',
                created_at: ts.toISOString(),
                updated_at: ts.toISOString()
            });
        }

        createAuditLog(
            user.id, user.username,
            'RETURN_CUSTOMER_CONSIGNMENT',
            'consignment', id,
            {
                entity_type: consignment.entity_type,
                entity_id: consignment.entity_id,
                entity_name: consignment.entity_name,
                product_id: consignment.product_id,
                product_name: product?.name,
                bottles_returned: bReturn,
                crates_returned: cReturn,
                refunded: totalRefund
            },
            req.ip, user.location_id
        );

        res.json({ success: true, refundedAmount: totalRefund, bottlesReturned: bReturn, cratesReturned: cReturn });
    } catch (error) {
        console.error('❌ Erreur POST /consignments/:id/return:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark consignment as lost
router.post('/consignments/:id/lost', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: consignment, error: getErr } = await supabase.from('packaging_consignments').select('*').eq('id', id).single();
        
        if (getErr) throw getErr;
        if (!consignment) return res.status(404).json({ error: 'Consignment not found' });
        
        // Mark as lost
        await supabase.from('packaging_consignments').update({
            status: 'lost',
            updated_at: new Date().toISOString()
        }).eq('id', id);
        
        // Record as loss
        await supabase.from('losses_and_damages').insert({
            id: uuidv4(),
            product_id: consignment.product_id,
            product_name: consignment.product_name,
            quantity: 0,
            empty_packaging_qty: consignment.empty_packaging_qty,
            empty_secondary_packaging_qty: consignment.empty_secondary_packaging_qty,
            loss_type: 'consignment_lost',
            reason: `Consigne perdue par ${consignment.entity_name}`,
            financial_value: (consignment.empty_packaging_qty * consignment.packaging_deposit_value) + (consignment.empty_secondary_packaging_qty * consignment.secondary_packaging_deposit_value),
            created_at: new Date().toISOString()
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur POST /consignments/:id/lost:', error);
        res.status(500).json({ error: error.message });
    }
});

// Declare broken empty packaging
router.post('/breakage', async (req, res) => {
    try {
        const { product_id, broken_bottles, broken_crates, reason, location_id: bodyLocationId } = req.body;
        const user = getUserFromRequest(req);

        const { data: product, error: prodErr } = await supabase.from('products').select('*').eq('id', product_id).single();
        if (prodErr) throw prodErr;
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const bBreak = Number(broken_bottles) || 0;
        const cBreak = Number(broken_crates) || 0;

        if (bBreak <= 0 && cBreak <= 0) return res.status(400).json({ error: 'Quantité invalide' });

        // Déterminer l'emplacement cible : location de l'utilisateur ou celle fournie par l'admin
        const targetLocationId = user.location_id || bodyLocationId;
        if (!targetLocationId) {
            return res.status(400).json({ error: 'Veuillez sélectionner un emplacement pour la déclaration de casse.' });
        }

        // Mise à jour du stock PAR EMPLACEMENT (isolation stricte)
        const { data: sbl } = await supabase
            .from('stock_by_location')
            .select('*')
            .eq('location_id', targetLocationId)
            .eq('product_id', product_id)
            .maybeSingle();

        const tsNow = new Date().toISOString();
        let beforeBottles = 0;
        let beforeCrates = 0;

        if (sbl) {
            beforeBottles = Number(sbl.empty_packaging_qty) || 0;
            beforeCrates = Number(sbl.empty_secondary_packaging_qty) || 0;
            const { error: sblUpdErr } = await supabase.from('stock_by_location').update({
                empty_packaging_qty: Math.max(0, beforeBottles - bBreak),
                empty_secondary_packaging_qty: Math.max(0, beforeCrates - cBreak),
                updated_at: tsNow
            }).eq('id', sbl.id);
            if (sblUpdErr) console.error('⚠️ stock_by_location.update (breakage):', sblUpdErr.message);
        } else {
            const { error: sblInsErr } = await supabase.from('stock_by_location').insert({
                id: uuidv4(),
                location_id: targetLocationId,
                product_id: product_id,
                quantity: 0,
                empty_packaging_qty: Math.max(0, 0 - bBreak),
                empty_secondary_packaging_qty: Math.max(0, 0 - cBreak),
                updated_at: tsNow
            });
            if (sblInsErr) console.error('⚠️ stock_by_location.insert (breakage):', sblInsErr.message);
        }

        await supabase.from('packaging_movements').insert({
            id: uuidv4(),
            location_id: targetLocationId,
            product_id: product_id,
            product_name: product.name,
            movement_type: 'breakage',
            empty_packaging_qty: bBreak,
            empty_secondary_packaging_qty: cBreak,
            source_type: 'manual',
            notes: reason || 'Déclaration de casse',
            created_at: new Date().toISOString()
        });

        const financialLoss = (bBreak * (Number(product.bottle_deposit_price) || 0)) +
                              (cBreak * (Number(product.crate_deposit_price) || 0));

        createAuditLog(
            user.id,
            user.username,
            'DECLARE_PACKAGING_BREAKAGE',
            'product',
            product_id,
            {
                product_name: product.name,
                broken_bottles: bBreak,
                broken_crates: cBreak,
                bottles_before: beforeBottles,
                bottles_after: Math.max(0, beforeBottles - bBreak),
                crates_before: beforeCrates,
                crates_after: Math.max(0, beforeCrates - cBreak),
                reason: reason || 'Déclaration de casse',
                financial_loss: financialLoss,
                location_id: targetLocationId
            },
            req.ip,
            targetLocationId
        );

        res.json({ success: true, financialLoss });
    } catch (error) {
        console.error('❌ Erreur POST /packaging/breakage:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify reception of packaging (Checklist) — called by the recipient to validate reception
// Body: {
//   purchase_id, supplier_id, supplier_name,
//   items: [{ product_id, product_name, received_empty_bottles, received_empty_crates,
//             broken_packaging_qty, broken_secondary_packaging_qty,
//             packaging_deposit_value, secondary_packaging_deposit_value, notes, verified }]
// }
//
// Direct consignment logic:
//   received_empty_bottles/crates = empty packaging received from supplier = consignment to return
//   The received qty is recorded as a pending consignment and suppliers.outstanding is incremented.
router.post('/verify-reception', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        const { purchase_id, supplier_id, supplier_name, items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Aucun emballage à vérifier.' });
        }
        console.log("=== VERIFY RECEPTION PAYLOAD ===");
        console.log(JSON.stringify(req.body, null, 2));


        // Fetch purchase group to know the location (where the stock was received)
        let purchaseLocationId = user.location_id || null;
        let purchaseGroup = null;
        let destinationIsStore = false;
        if (purchase_id) {
            const { data: pg } = await supabase
                .from('purchase_groups')
                .select('id, location_id, reception_status, reference, items:purchase_group_items(*)')
                .eq('id', purchase_id)
                .maybeSingle();
            purchaseGroup = pg;
            if (pg?.location_id) purchaseLocationId = pg.location_id;
        }

        // Determine the type of the destination location.
        if (purchaseGroup && purchaseGroup.location_id) {
            const { data: destLoc } = await supabase
                .from('locations')
                .select('id, type, name')
                .eq('id', purchaseGroup.location_id)
                .maybeSingle();
            destinationIsStore = destLoc?.type === 'store';
        } else {
            destinationIsStore = true;
        }

        // Authorize: only admin OR user at the destination
        if (purchaseGroup && purchaseGroup.location_id) {
            const isAdmin = user.role === 'admin';
            const isAtDestination = user.location_id && user.location_id === purchaseGroup.location_id;
            if (!isAdmin && !isAtDestination) {
                return res.status(403).json({ error: 'Seul le destinataire (ou un admin) peut faire la vérification.' });
            }
            if (purchaseGroup.reception_status === 'received') {
                return res.status(400).json({ error: 'Cette commande a déjà été réceptionnée.' });
            }
        }

        // Build ordered quantity lookup from purchase_group_items
        const orderItemsByProduct = {};
        if (purchaseGroup?.items) {
            for (const oi of purchaseGroup.items) {
                if (oi.product_id) {
                    orderItemsByProduct[oi.product_id] = oi;
                }
            }
        }

        const results = [];
        const consignmentErrors = [];
        let totalBottlesReceived = 0;
        let totalCratesReceived = 0;
        let totalBottlesBroken = 0;
        let totalCratesBroken = 0;
        let totalDepositValue = 0;
        
        let totalBottlesExchanged = 0;
        let totalCratesExchanged = 0;
        let totalBottlesConsigned = 0;
        let totalCratesConsigned = 0;

        // 1. ALWAYS add the full product quantity to destination stock for each order item
        if (purchaseGroup && purchaseGroup.reception_status !== 'received') {
            for (const productId of Object.keys(orderItemsByProduct)) {
                const orderItem = orderItemsByProduct[productId];
                const qty = Number(orderItem.quantity);
                if (!qty || qty <= 0) continue;

                const { data: product } = await supabase
                    .from('products')
                    .select('id, name, stock')
                    .eq('id', productId)
                    .maybeSingle();
                if (!product) continue;

                const currentStock = Number(product.stock) || 0;
                const newStock = currentStock + qty;

                if (destinationIsStore) {
                    await supabase.from('products').update({ stock: newStock }).eq('id', productId);
                }

                if (purchaseLocationId) {
                    const { data: locStock } = await supabase
                        .from('stock_by_location')
                        .select('*')
                        .eq('location_id', purchaseLocationId)
                        .eq('product_id', productId)
                        .maybeSingle();
                    if (locStock) {
                        await supabase.from('stock_by_location').update({
                            quantity: (Number(locStock.quantity) || 0) + qty,
                            updated_at: new Date().toISOString()
                        }).eq('id', locStock.id);
                    } else {
                        await supabase.from('stock_by_location').insert({
                            id: uuidv4(),
                            location_id: purchaseLocationId,
                            product_id: productId,
                            quantity: qty
                        });
                    }
                }

                await supabase.from('stock_movements').insert({
                    id: uuidv4(),
                    product_id: productId,
                    location_id: purchaseLocationId,
                    product_name: product.name,
                    movement_type: 'reception',
                    quantity: qty,
                    stock_before: destinationIsStore ? currentStock : null,
                    stock_after: destinationIsStore ? newStock : null,
                    transaction_ref: purchaseGroup.reference,
                    notes: `Réception checklist - ${purchaseGroup.reference}${destinationIsStore ? '' : ' [entrepôt — global products.stock inchangé]'}`
                });
            }
        }

        // 2. For each item: record received empty packaging as consignment
        for (const item of items) {
            if (!item.product_id) continue;

            // Fields from frontend: received_empty_bottles / received_empty_crates
            const emptyB = Number(item.received_empty_bottles) || 0;
            const emptyC = Number(item.received_empty_crates) || 0;
            const brokenB = Number(item.broken_packaging_qty) || 0;
            const brokenC = Number(item.broken_secondary_packaging_qty) || 0;
            const depB = Number(item.packaging_deposit_value) || 0;
            const depC = Number(item.secondary_packaging_deposit_value) || 0;

            // Ordered quantity from purchase_group_items (for reference only)
            const orderedB = Number(orderItemsByProduct[item.product_id]?.quantity) || 0;

            const { data: product } = await supabase
                .from('products')
                .select('id, name, has_packaging, units_per_secondary_packaging, bottle_deposit_price, crate_deposit_price')
                .eq('id', item.product_id)
                .maybeSingle();
            if (!product) continue;

            // Skip if nothing to process
            if (emptyB <= 0 && emptyC <= 0 && brokenB <= 0 && brokenC <= 0) continue;

            // ── AUTOMATIC EXCHANGE & CONSIGNMENT ──
            if (emptyB > 0 || emptyC > 0) {
                if (!supplier_id || supplier_id === 'unknown') {
                    console.error('❌ supplier_id manquant ou "unknown" lors de la réception. supplier_id:', supplier_id, 'purchase_id:', purchase_id);
                }

                // 1. Lire le stock vide disponible
                let availableB = 0;
                let availableC = 0;
                let existingStock = null;

                if (purchaseLocationId) {
                    const { data: sblData } = await supabase
                        .from('stock_by_location')
                        .select('*')
                        .eq('location_id', purchaseLocationId)
                        .eq('product_id', item.product_id)
                        .maybeSingle();
                    if (sblData) {
                        existingStock = sblData;
                        availableB = Number(sblData.empty_packaging_qty) || 0;
                        availableC = Number(sblData.empty_secondary_packaging_qty) || 0;
                    }
                }

                // 2. Calculer l'échange immédiat et le déficit
                const exchangeB = Math.min(availableB, emptyB);
                const exchangeC = Math.min(availableC, emptyC);
                
                const consignB = emptyB - exchangeB;
                const consignC = emptyC - exchangeC;

                // On enrichit l'item pour le retour au frontend et le calcul de la dépense
                item.exchange_bottles = exchangeB;
                item.exchange_crates = exchangeC;
                item.consign_bottles = consignB;
                item.consign_crates = consignC;

                // 3. Traiter l'ÉCHANGE (Déduction du stock physique d'emballages vides)
                if (exchangeB > 0 || exchangeC > 0) {
                    // Enregistrer le mouvement de sortie (retour fournisseur)
                    await supabase.from('packaging_movements').insert({
                        id: uuidv4(),
                        location_id: purchaseLocationId,
                        product_id: item.product_id,
                        product_name: product.name,
                        movement_type: 'supplier_return',
                        empty_packaging_qty: exchangeB,
                        empty_secondary_packaging_qty: exchangeC,
                        source_type: 'purchase',
                        source_id: purchase_id || null,
                        notes: `Échange automatique à la réception — ${exchangeB} B, ${exchangeC} C vides retournés.`,
                        created_at: new Date().toISOString()
                    });

                    // Déduire du stock_by_location
                    if (existingStock) {
                        await supabase.from('stock_by_location').update({
                            empty_packaging_qty: availableB - exchangeB,
                            empty_secondary_packaging_qty: availableC - exchangeC,
                            updated_at: new Date().toISOString()
                        }).eq('id', existingStock.id);
                    }
                }

                // 4. Traiter le DÉFICIT = CONSIGNE AUTOMATIQUE
                console.log(`[consign] emptyB=${emptyB} emptyC=${emptyC} exchangeB=${exchangeB} exchangeC=${exchangeC} consignB=${consignB} consignC=${consignC}`);
                if (consignB > 0 || consignC > 0) {
                    // Créer la consigne
                    const consignmentId = uuidv4();
                    console.log(`[consign] Inserting consignment: product=${product.name}, B=${consignB}, C=${consignC}, supplier=${supplier_id}`);
                    const { error: consErr } = await supabase
                        .from('packaging_consignments')
                        .insert({
                            id: consignmentId,
                            location_id: purchaseLocationId,
                            entity_type: 'supplier',
                            entity_id: supplier_id || 'unknown',
                            entity_name: supplier_name || 'Fournisseur inconnu',
                            product_id: item.product_id,
                            product_name: product.name,
                            empty_packaging_qty: consignB,
                            empty_secondary_packaging_qty: consignC,
                            packaging_deposit_value: depB,
                            secondary_packaging_deposit_value: depC,
                            status: 'pending',
                            source_transaction_id: purchase_id || null,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    
                    if (consErr) {
                        console.error('❌ ERREUR consignment INSERT:', consErr.message, JSON.stringify(consErr));
                        consignmentErrors.push({ product_id: item.product_id, error: consErr.message });
                    } else {
                        console.log('✅ Consignment inserted successfully:', consignmentId);
                    }

                    // Incrémenter la dette d'emballage du fournisseur
                    if (supplier_id && supplier_id !== 'unknown') {
                        const { data: supplier } = await supabase
                            .from('suppliers')
                            .select('id, outstanding_bottles, outstanding_crates')
                            .eq('id', supplier_id)
                            .maybeSingle();
                            
                        if (supplier) {
                            await supabase.from('suppliers').update({
                                outstanding_bottles: (Number(supplier.outstanding_bottles) || 0) + consignB,
                                outstanding_crates: (Number(supplier.outstanding_crates) || 0) + consignC,
                                updated_at: new Date().toISOString()
                            }).eq('id', supplier_id);
                        }
                    }

                    // On n'ajoute PLUS les consignes fournisseur au stock vide (ni stock_by_location, ni products).
                    // Car les emballages livrés par le fournisseur sont pleins (le liquide est compté dans 'stock').
                    // Ils ne deviendront des "emballages vides" que lorsqu'ils seront retournés par les clients.
                }

                // Enregistrer le mouvement d'entrée "théorique" global pour la traçabilité
                await supabase.from('packaging_movements').insert({
                    id: uuidv4(),
                    location_id: purchaseLocationId,
                    product_id: item.product_id,
                    product_name: product.name,
                    movement_type: 'in',
                    empty_packaging_qty: emptyB,
                    empty_secondary_packaging_qty: emptyC,
                    source_type: 'purchase',
                    source_id: purchase_id || null,
                    notes: `Réception achat — Reçu ${emptyB} B / ${emptyC} C (${exchangeB}/${exchangeC} échangées, ${consignB}/${consignC} consignés)`,
                    created_at: new Date().toISOString()
                });
            } else {
                item.exchange_bottles = 0;
                item.exchange_crates = 0;
                item.consign_bottles = 0;
                item.consign_crates = 0;
            }

            // ── BREAKAGE (independent of consignment) ───────────────────
            if (brokenB > 0 || brokenC > 0) {
                await supabase.from('losses_and_damages').insert({
                    id: uuidv4(),
                    location_id: purchaseLocationId,
                    product_id: item.product_id,
                    product_name: product.name,
                    quantity: 0,
                    empty_packaging_qty: brokenB,
                    empty_secondary_packaging_qty: brokenC,
                    type: 'casse_reception',
                    responsible_user_id: user.id,
                    is_reimbursed: false,
                    notes: `Casse constatée à la réception${item.notes ? ' - ' + item.notes : ''}`,
                    created_by: user.id
                });

                await supabase.from('packaging_movements').insert({
                    id: uuidv4(),
                    location_id: purchaseLocationId,
                    product_id: item.product_id,
                    product_name: product.name,
                    movement_type: 'breakage',
                    empty_packaging_qty: brokenB,
                    empty_secondary_packaging_qty: brokenC,
                    source_type: 'purchase',
                    source_id: purchase_id || null,
                    notes: `Casse à la réception${item.notes ? ' - ' + item.notes : ''}`,
                    created_at: new Date().toISOString()
                });
            }

            totalBottlesReceived += emptyB;
            totalCratesReceived += emptyC;
            totalBottlesBroken += brokenB;
            totalCratesBroken += brokenC;
            
            const consignB = item.consign_bottles || 0;
            const consignC = item.consign_crates || 0;
            totalDepositValue += (consignB * depB) + (consignC * depC);
            
            totalBottlesExchanged += item.exchange_bottles || 0;
            totalCratesExchanged += item.exchange_crates || 0;
            totalBottlesConsigned += consignB;
            totalCratesConsigned += consignC;

            results.push({
                product_id: item.product_id,
                product_name: product.name,
                ordered_bottles: orderedB,
                received_empty_bottles: emptyB,
                received_empty_crates: emptyC,
                broken_bottles: brokenB,
                broken_crates: brokenC,
                exchange_bottles: item.exchange_bottles || 0,
                exchange_crates: item.exchange_crates || 0,
                consign_bottles: consignB,
                consign_crates: consignC
            });
        }

        // ── FINANCIAL ACCOUNTING: Consignment fees → supplier debt ──
        if (totalDepositValue > 0 && supplier_id && supplier_id !== 'unknown') {
            console.log('💰 Calcul frais consignation:', totalDepositValue, 'supplier:', supplier_id);

            // 1. Create expense record
            const expenseId = uuidv4();
            const { error: expErr } = await supabase.from('expenses').insert({
                id: expenseId,
                location_id: purchaseLocationId,
                description: `Frais de consignation automatique - ${supplier_name || 'Fournisseur'} - ${purchaseGroup?.reference || ''}`,
                amount: totalDepositValue,
                category: 'consignment',
                payment_method: 'on_credit',
                date: new Date().toISOString().split('T')[0],
                notes: `Consigne sur déficit: ${totalBottlesConsigned} bouteille(s), ${totalCratesConsigned} cageot(s) — Achat ${purchaseGroup?.reference || ''} (${totalBottlesExchanged}B/${totalCratesExchanged}C échangés)`,
                created_at: new Date().toISOString()
            });
            if (expErr) {
                console.error('❌ ERREUR expense INSERT (consignation):', expErr.message, expErr);
            } else {
                console.log('✅ Expense consignment created:', expenseId, 'montant:', totalDepositValue);
            }

            // 2. Create supplier_transaction record (debt increase)
            const transId = uuidv4();
            const { error: stErr } = await supabase.from('supplier_transactions').insert({
                id: transId,
                supplier_id: supplier_id,
                location_id: purchaseLocationId,
                type: 'consignment_fee',
                reference: purchaseGroup?.reference || null,
                total_amount: totalDepositValue,
                paid_amount: 0,
                debt_amount: totalDepositValue,
                payment_method: 'on_credit',
                date: new Date().toISOString().split('T')[0],
                notes: `Frais consignation sur déficit: ${totalBottlesConsigned} bouteille(s) + ${totalCratesConsigned} cageot(s) — ${purchaseGroup?.reference || ''}`,
                created_at: new Date().toISOString()
            });
            if (stErr) {
                console.error('❌ ERREUR supplier_transactions INSERT (consignation):', stErr.message, stErr);
            } else {
                console.log('✅ Supplier transaction consignment created:', transId, 'debt:', totalDepositValue);
            }

            // 3. Update suppliers.total_debt
            const { data: currentSupplier, error: selErr } = await supabase
                .from('suppliers')
                .select('id, total_debt')
                .eq('id', supplier_id)
                .maybeSingle();
            if (selErr) {
                console.error('❌ ERREUR supplier SELECT (total_debt):', selErr.message);
            } else if (currentSupplier) {
                const newDebt = (Number(currentSupplier.total_debt) || 0) + totalDepositValue;
                const { error: debtUpdErr } = await supabase.from('suppliers').update({
                    total_debt: newDebt,
                    updated_at: new Date().toISOString()
                }).eq('id', supplier_id);
                if (debtUpdErr) {
                    console.error('❌ ERREUR supplier UPDATE total_debt:', debtUpdErr.message);
                } else {
                    console.log('✅ Supplier total_debt updated:', supplier_id, 'new debt:', newDebt);
                }
            }
        }

        createAuditLog(
            user.id,
            user.username,
            'VERIFY_PACKAGING_RECEPTION',
            'purchase_group',
            purchase_id || 'manual',
            {
                supplier_name: supplier_name || null,
                items_count: results.length,
                total_empty_bottles_received: totalBottlesReceived,
                total_empty_crates_received: totalCratesReceived,
                total_bottles_broken: totalBottlesBroken,
                total_crates_broken: totalCratesBroken,
                total_deposit_value: totalDepositValue
            },
            req.ip,
            purchaseLocationId || user.location_id
        );

        // Mark the purchase group as received (only if it was still in_transit)
        let receptionUpdated = false;
        if (purchaseGroup && purchaseGroup.reception_status !== 'received') {
            const { data: updData, error: updErr } = await supabase
                .from('purchase_groups')
                .update({
                    reception_status: 'received',
                    status: 'validated',
                    received_at: new Date().toISOString(),
                    received_by: user.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', purchase_id)
                .select('id, reception_status, status')
                .maybeSingle();

            if (updErr) {
                console.error('❌ Could not mark group as received:', updErr.message, updErr);
                return res.status(500).json({
                    error: `Impossible de mettre à jour le statut de la commande: ${updErr.message}`,
                    success: false
                });
            }
            receptionUpdated = true;
            console.log(`✅ Group ${purchase_id} marked as received (${updData?.reception_status || 'unknown'})`);
        }

        res.json({
            success: true,
            items: results,
            reception_updated: receptionUpdated,
            consignment_errors: consignmentErrors.length > 0 ? consignmentErrors : undefined,
            totals: {
                bottles_received: totalBottlesReceived,
                crates_received: totalCratesReceived,
                bottles_broken: totalBottlesBroken,
                crates_broken: totalCratesBroken,
                bottles_exchanged: totalBottlesExchanged,
                crates_exchanged: totalCratesExchanged,
                bottles_consigned: totalBottlesConsigned,
                crates_consigned: totalCratesConsigned,
                consigned: totalBottlesConsigned + totalCratesConsigned,
                credit: totalDepositValue,
                deposit_value: totalDepositValue
            }
        });
    } catch (error) {
        console.error('❌ Erreur POST /packaging/verify-reception:', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERT D'EMBALLAGES VIDES inter-emplacements et vers fournisseurs
// ═══════════════════════════════════════════════════════════════════════════════
// POST /packaging/transfer-empty
// Body: {
//   from_location_id, to_location_id (null si fournisseur),
//   supplier_id (null si inter-emplacement),
//   items: [{ product_id, empty_qty, empty_secondary_qty }]
// }
router.post('/transfer-empty', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        const { from_location_id, to_location_id, supplier_id, items } = req.body;

        if (!from_location_id) return res.status(400).json({ error: 'Emplacement de départ requis.' });
        if (!to_location_id && !supplier_id) return res.status(400).json({ error: 'Destination requise.' });
        if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Aucun article à transférer.' });

        const { data: fromLoc, error: fromLocErr } = await supabase.from('locations').select('id, name, type').eq('id', from_location_id).maybeSingle();
        if (fromLocErr) throw fromLocErr;
        if (!fromLoc) return res.status(404).json({ error: 'Emplacement de départ introuvable.' });

        let toLoc = null;
        let supplier = null;
        const isSupplierReturn = !!supplier_id && !to_location_id;

        if (isSupplierReturn) {
            const { data: s, error: sErr } = await supabase.from('suppliers').select('id, name, total_debt, outstanding_bottles, outstanding_crates').eq('id', supplier_id).maybeSingle();
            if (sErr) throw sErr;
            if (!s) return res.status(404).json({ error: 'Fournisseur introuvable.' });
            supplier = s;
        } else {
            const { data: tl, error: tlErr } = await supabase.from('locations').select('id, name, type').eq('id', to_location_id).maybeSingle();
            if (tlErr) throw tlErr;
            if (!tl) return res.status(404).json({ error: 'Emplacement de destination introuvable.' });
            toLoc = tl;
        }

        // ── Contrôle de stock & collecte des données ─────────────────────────
        const results = [];
        let totalBottlesTransferred = 0;
        let totalCratesTransferred = 0;
        let totalDebtReduction = 0;

        for (const item of items) {
            const emptyQty = Number(item.empty_qty) || 0;
            const emptySecQty = Number(item.empty_secondary_qty) || 0;
            if (emptyQty <= 0 && emptySecQty <= 0) continue;

            const { data: srcStock, error: srcErr } = await supabase.from('stock_by_location').select('*').eq('location_id', from_location_id).eq('product_id', item.product_id).maybeSingle();
            if (srcErr) throw srcErr;

            const availBottles = Number(srcStock?.empty_packaging_qty) || 0;
            const availCrates = Number(srcStock?.empty_secondary_packaging_qty) || 0;

            if (emptyQty > availBottles || emptySecQty > availCrates) {
                return res.status(400).json({
                    error: `Stock insuffisant pour le produit ${item.product_id}. Bouteilles dispo: ${availBottles}, demandées: ${emptyQty}. Cageots dispo: ${availCrates}, demandés: ${emptySecQty}.`
                });
            }

            const { data: product } = await supabase.from('products').select('id, name, packaging_type_id, secondary_packaging_type_id').eq('id', item.product_id).maybeSingle();

            totalBottlesTransferred += emptyQty;
            totalCratesTransferred += emptySecQty;
            results.push({ product_id: item.product_id, product_name: product?.name || 'Produit inconnu', bottles: emptyQty, crates: emptySecQty, _product: product, _srcStock: srcStock });
        }

        // ═══════════════════════════════════════════════════════════════════
        // CAS 1 : RETOUR FOURNISSEUR (application immédiate, pas de transit)
        // ═══════════════════════════════════════════════════════════════════
        if (isSupplierReturn) {
            for (const r of results) {
                const { product_id, product_name, bottles, crates, _product, _srcStock } = r;

                // Décrémenter stock source immédiatement (UPSERT garanti)
                const tsReturn = new Date().toISOString();
                if (_srcStock) {
                    const { error: sblUpdErr } = await supabase.from('stock_by_location').update({
                        empty_packaging_qty: Math.max(0, (Number(_srcStock.empty_packaging_qty) || 0) - bottles),
                        empty_secondary_packaging_qty: Math.max(0, (Number(_srcStock.empty_secondary_packaging_qty) || 0) - crates),
                        updated_at: tsReturn
                    }).eq('id', _srcStock.id);
                    if (sblUpdErr) console.error('⚠️ stock_by_location.update (supplier return):', sblUpdErr.message);
                } else {
                    const { error: sblInsErr } = await supabase.from('stock_by_location').insert({
                        id: uuidv4(),
                        location_id: from_location_id,
                        product_id,
                        quantity: 0,
                        empty_packaging_qty: 0,
                        empty_secondary_packaging_qty: 0,
                        updated_at: tsReturn
                    });
                    if (sblInsErr) console.error('⚠️ stock_by_location.insert (supplier return):', sblInsErr.message);
                }

                // Calculer réduction de dette
                let itemDebtReduction = 0;
                if (bottles > 0 && _product?.packaging_type_id) {
                    const { data: pType } = await supabase.from('packaging_types').select('deposit_value').eq('id', _product.packaging_type_id).maybeSingle();
                    itemDebtReduction += (pType?.deposit_value || 0) * bottles;
                }
                if (crates > 0 && _product?.secondary_packaging_type_id) {
                    const { data: sType } = await supabase.from('packaging_types').select('deposit_value').eq('id', _product.secondary_packaging_type_id).maybeSingle();
                    itemDebtReduction += (sType?.deposit_value || 0) * crates;
                }

                const newDebt = Math.max(0, parseFloat(supplier.total_debt || 0) - itemDebtReduction);
                const newOutBottles = Math.max(0, (Number(supplier.outstanding_bottles) || 0) - bottles);
                const newOutCrates = Math.max(0, (Number(supplier.outstanding_crates) || 0) - crates);
                await supabase.from('suppliers').update({ total_debt: newDebt, outstanding_bottles: newOutBottles, outstanding_crates: newOutCrates }).eq('id', supplier_id);
                supplier.total_debt = newDebt; supplier.outstanding_bottles = newOutBottles; supplier.outstanding_crates = newOutCrates;
                totalDebtReduction += itemDebtReduction;

                await supabase.from('supplier_transactions').insert({ id: uuidv4(), supplier_id, location_id: from_location_id, type: 'packaging_return', total_amount: itemDebtReduction, date: new Date().toISOString().split('T')[0], notes: `Retour emballages: ${bottles} bouteille(s), ${crates} cageot(s) — ${product_name}` });

                // FIFO consignations fournisseur
                const { data: pendingCons } = await supabase.from('packaging_consignments').select('*').eq('entity_type', 'supplier').eq('entity_id', supplier_id).eq('product_id', product_id).in('status', ['pending', 'partial']).order('created_at', { ascending: true });
                let remB = bottles, remC = crates;
                for (const cons of (pendingCons || [])) {
                    if (remB <= 0 && remC <= 0) break;
                    const cB = Number(cons.empty_packaging_qty) || 0, cC = Number(cons.empty_secondary_packaging_qty) || 0;
                    const dB = Math.min(cB, remB), dC = Math.min(cC, remC);
                    remB -= dB; remC -= dC;
                    await supabase.from('packaging_consignments').update({ empty_packaging_qty: cB - dB, empty_secondary_packaging_qty: cC - dC, status: (cB - dB === 0 && cC - dC === 0) ? 'returned' : 'partial', updated_at: new Date().toISOString() }).eq('id', cons.id);
                }

                await supabase.from('packaging_movements').insert({ id: uuidv4(), location_id: from_location_id, product_id, product_name, movement_type: 'supplier_return', empty_packaging_qty: bottles, empty_secondary_packaging_qty: crates, source_type: 'manual', notes: `Retour fournisseur: ${fromLoc.name} → ${supplier.name}`, created_at: new Date().toISOString(), created_by: user.id });
            }

            createAuditLog(user.id, user.username, 'TRANSFER_EMPTY_PACKAGING', 'packaging', from_location_id, { from_location: fromLoc.name, to_location: `Fournisseur: ${supplier.name}`, supplier_id, total_bottles: totalBottlesTransferred, total_crates: totalCratesTransferred, debt_reduction: totalDebtReduction }, req.ip, from_location_id);

            return res.json({ success: true, mode: 'supplier_return', items: results.map(r => ({ product_id: r.product_id, product_name: r.product_name, bottles: r.bottles, crates: r.crates })), totals: { bottles: totalBottlesTransferred, crates: totalCratesTransferred, debt_reduction: totalDebtReduction } });
        }

        // ═══════════════════════════════════════════════════════════════════
        // CAS 2 : TRANSFERT INTER-EMPLACEMENTS → MISE EN TRANSIT
        // La source est débitée immédiatement. La destination ne reçoit
        // le stock qu'après validation de la checklist de réception.
        // ═══════════════════════════════════════════════════════════════════
        const transferId = uuidv4();
        const reference = `EPK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

        const { error: headerErr } = await tryWithOptionalColumn({
            table: 'stock_transfers',
            optionalCol: 'transfer_type',
            payload: {
                id: transferId,
                reference,
                from_location_id,
                to_location_id,
                status: 'in_transit',
                transfer_type: 'empty_packaging',
                notes: `Transfert emballages vides: ${fromLoc.name} → ${toLoc.name}`,
                created_by: user.id,
                shipped_at: new Date().toISOString()
            },
            execute: (p) => supabase.from('stock_transfers').insert([p]).then(r => ({ data: r.data, error: r.error }))
        });
        if (headerErr) throw headerErr;

        for (const r of results) {
            const { product_id, product_name, bottles, crates, _srcStock } = r;

            // Insérer l'item du transfert (tolérance colonne product_name)
            const { error: itemErr } = await tryWithOptionalColumn({
                table: 'stock_transfer_items',
                optionalCol: 'product_name',
                payload: {
                    id: uuidv4(),
                    transfer_id: transferId,
                    product_id,
                    product_name,
                    quantity: 0,
                    empty_packaging_qty: bottles,
                    empty_secondary_packaging_qty: crates
                },
                execute: (p) => supabase.from('stock_transfer_items').insert([p]).then(r => ({ data: r.data, error: r.error }))
            });
            if (itemErr) throw itemErr;

            // ✅ DÉDUIRE IMMÉDIATEMENT DU STOCK SOURCE
            //    UPSERT inconditionnel : si la ligne (location,product) n'existe
            //    pas, on la crée avec les compteurs initiaux à 0, puis on
            //    applique la décrémentation. Cela garantit que le Magasin perd
            //    bien la quantité au moment exact de la confirmation, même si
            //    le produit n'avait jamais été initialisé pour cet emplacement.
            const tsDepart = new Date().toISOString();
            if (_srcStock) {
                const { error: sblUpdErr } = await supabase.from('stock_by_location').update({
                    empty_packaging_qty: Math.max(0, (Number(_srcStock.empty_packaging_qty) || 0) - bottles),
                    empty_secondary_packaging_qty: Math.max(0, (Number(_srcStock.empty_secondary_packaging_qty) || 0) - crates),
                    updated_at: tsDepart
                }).eq('id', _srcStock.id);
                if (sblUpdErr) console.error('⚠️ stock_by_location.update (transfer src):', sblUpdErr.message);
            } else {
                // Création de la ligne au cas où (location,product) n'existe pas
                const { error: sblInsErr } = await supabase.from('stock_by_location').insert({
                    id: uuidv4(),
                    location_id: from_location_id,
                    product_id,
                    quantity: 0,
                    empty_packaging_qty: 0,
                    empty_secondary_packaging_qty: 0,
                    updated_at: tsDepart
                });
                if (sblInsErr) console.error('⚠️ stock_by_location.insert (transfer src):', sblInsErr.message);
            }

            // Traçabilité sortante
            await supabase.from('packaging_movements').insert({
                id: uuidv4(),
                location_id: from_location_id,
                product_id,
                product_name,
                movement_type: 'empty_transfer',
                empty_packaging_qty: bottles,
                empty_secondary_packaging_qty: crates,
                source_type: 'transfer',
                source_id: transferId,
                notes: `[DÉPART] ${fromLoc.name} → ${toLoc.name} (réf: ${reference})`,
                created_at: new Date().toISOString(),
                created_by: user.id
            });
        }

        createAuditLog(user.id, user.username, 'TRANSFER_EMPTY_PACKAGING', 'packaging', from_location_id, {
            transfer_id: transferId,
            reference,
            from_location: fromLoc.name,
            to_location: toLoc.name,
            total_bottles: totalBottlesTransferred,
            total_crates: totalCratesTransferred
        }, req.ip, from_location_id);

        res.json({
            success: true,
            mode: 'transit',
            transfer_id: transferId,
            reference,
            message: `Transfert mis en transit. L'emplacement destinataire doit valider la réception.`,
            items: results.map(r => ({ product_id: r.product_id, product_name: r.product_name, bottles: r.bottles, crates: r.crates })),
            totals: {
                bottles: totalBottlesTransferred,
                crates: totalCratesTransferred,
                debt_reduction: 0
            }
        });
    } catch (error) {
        console.error('❌ Erreur POST /packaging/transfer-empty:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
