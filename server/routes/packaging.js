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

        // 3. Increment empty stock (compteur global)
        const { data: product } = await supabase
            .from('products')
            .select('empty_packaging_qty, empty_secondary_packaging_qty, name, location_id')
            .eq('id', product_id)
            .maybeSingle();

        if (product) {
            await supabase
                .from('products')
                .update({
                    empty_packaging_qty: (Number(product.empty_packaging_qty) || 0) + bottlesToReturn,
                    empty_secondary_packaging_qty: (Number(product.empty_secondary_packaging_qty) || 0) + cratesToReturn
                })
                .eq('id', product_id);
        }

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

        if (error) throw error;
        res.json(consignments || []);
    } catch (error) {
        console.error('❌ Erreur GET /packaging/consignments:', error);
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

        // Increment empty stock (compteur global)
        const { data: product } = await supabase.from('products').select('empty_packaging_qty, empty_secondary_packaging_qty, name').eq('id', consignment.product_id).single();
        if (product) {
            await supabase.from('products').update({
                empty_packaging_qty: (Number(product.empty_packaging_qty) || 0) + bReturn,
                empty_secondary_packaging_qty: (Number(product.empty_secondary_packaging_qty) || 0) + cReturn
            }).eq('id', consignment.product_id);
        }

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
        const { product_id, broken_bottles, broken_crates, reason } = req.body;
        const user = getUserFromRequest(req);

        const { data: product, error: prodErr } = await supabase.from('products').select('*').eq('id', product_id).single();
        if (prodErr) throw prodErr;
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const bBreak = Number(broken_bottles) || 0;
        const cBreak = Number(broken_crates) || 0;

        if (bBreak <= 0 && cBreak <= 0) return res.status(400).json({ error: 'Quantité invalide' });

        const oldBAvail = Number(product.empty_packaging_qty) || 0;
        const oldCAvail = Number(product.empty_secondary_packaging_qty) || 0;
        const newBAvail = Math.max(0, oldBAvail - bBreak);
        const newCAvail = Math.max(0, oldCAvail - cBreak);

        // 1) Mise à jour du compteur global (admin / agrégat)
        const { error: prodUpdErr } = await supabase.from('products').update({
            empty_packaging_qty: newBAvail,
            empty_secondary_packaging_qty: newCAvail
        }).eq('id', product_id);
        if (prodUpdErr) console.error('⚠️ products.update (breakage):', prodUpdErr.message);

        // 2) Mise à jour du stock PAR EMPLACEMENT (ce que voit l'utilisateur)
        //    Si l'utilisateur n'a pas de location_id (admin pur), on propage la
        //    décrémentation à TOUTES les lignes stock_by_location du produit
        //    pour rester cohérent avec l'agrégat global.
        if (user.location_id) {
            const { data: sbl } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', user.location_id)
                .eq('product_id', product_id)
                .maybeSingle();

            const tsNow = new Date().toISOString();
            if (sbl) {
                const { error: sblUpdErr } = await supabase.from('stock_by_location').update({
                    empty_packaging_qty: Math.max(0, (Number(sbl.empty_packaging_qty) || 0) - bBreak),
                    empty_secondary_packaging_qty: Math.max(0, (Number(sbl.empty_secondary_packaging_qty) || 0) - cBreak),
                    updated_at: tsNow
                }).eq('id', sbl.id);
                if (sblUpdErr) console.error('⚠️ stock_by_location.update (breakage):', sblUpdErr.message);
            } else {
                // Création de la ligne (UPSERT) avec compteurs initiaux à 0.
                // La casse est déjà appliquée sur le compteur global `products`,
                // ici on initialise la ligne per-location à 0 pour rester
                // cohérent (le Math.max ci-dessous ne peut pas être négatif).
                const { error: sblInsErr } = await supabase.from('stock_by_location').insert({
                    id: uuidv4(),
                    location_id: user.location_id,
                    product_id: product_id,
                    quantity: 0,
                    empty_packaging_qty: Math.max(0, 0 - bBreak),
                    empty_secondary_packaging_qty: Math.max(0, 0 - cBreak),
                    updated_at: tsNow
                });
                if (sblInsErr) console.error('⚠️ stock_by_location.insert (breakage):', sblInsErr.message);
            }
        } else {
            // Admin sans location_id : décrémente proportionnellement chaque ligne
            // existante (ou crée une ligne à 0 si absente) pour ce produit.
            const { data: allSbl } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('product_id', product_id);
            const tsNow = new Date().toISOString();
            for (const row of (allSbl || [])) {
                await supabase.from('stock_by_location').update({
                    empty_packaging_qty: Math.max(0, (Number(row.empty_packaging_qty) || 0) - bBreak),
                    empty_secondary_packaging_qty: Math.max(0, (Number(row.empty_secondary_packaging_qty) || 0) - cBreak),
                    updated_at: tsNow
                }).eq('id', row.id);
            }
        }

        await supabase.from('packaging_movements').insert({
            id: uuidv4(),
            location_id: user.location_id || null,
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
                bottles_before: oldBAvail,
                bottles_after: newBAvail,
                crates_before: oldCAvail,
                crates_after: newCAvail,
                reason: reason || 'Déclaration de casse',
                financial_loss: financialLoss
            },
            req.ip,
            user.location_id
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
//   items: [{ product_id, product_name, empty_packaging_qty, empty_secondary_packaging_qty,
//             broken_packaging_qty, broken_secondary_packaging_qty,
//             packaging_deposit_value, secondary_packaging_deposit_value, notes, verified }]
// }
router.post('/verify-reception', async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        const { purchase_id, supplier_id, supplier_name, items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Aucun emballage à vérifier.' });
        }

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
        // CRITICAL: the global `products.stock` is the "Magasin" (store) stock only.
        // When a purchase's destination is a warehouse (Entrepôt), we must NOT touch
        // the global products.stock — only the per-location stock_by_location row.
        //
        // We ALWAYS read the destination strictly from `purchaseGroup.location_id`,
        // NEVER from `user.location_id`. Even an admin validating on behalf of an
        // Entrepôt must not pollute the Magasin stock.
        if (purchaseGroup && purchaseGroup.location_id) {
            const { data: destLoc } = await supabase
                .from('locations')
                .select('id, type, name')
                .eq('id', purchaseGroup.location_id)
                .maybeSingle();
            destinationIsStore = destLoc?.type === 'store';
        } else {
            // Purchase has no `location_id` at all → legacy "direct to Magasin" flow.
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

        const results = [];
        let totalBottlesReceived = 0;
        let totalCratesReceived = 0;
        let totalBottlesBroken = 0;
        let totalCratesBroken = 0;
        let totalDepositValue = 0;

        // Determine which products the order contained (full order items, not just the checklist)
        const orderItemsByProduct = {};
        if (purchaseGroup?.items) {
            for (const oi of purchaseGroup.items) {
                if (oi.product_id) {
                    orderItemsByProduct[oi.product_id] = oi;
                }
            }
        }

        // 1. ALWAYS add the full product quantity to destination stock for each order item
        //    (independent of whether the user entered any empty packaging qty).
        //    This is the core "reception" action: the ordered product arrives at the warehouse.
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

                // CRITICAL: only touch the global `products.stock` if the
                // destination is a `store` (Magasin). For warehouse destinations
                // (Entrepôt 1/2), the global products.stock must stay unchanged —
                // it is the Magasin's stock, not the Entrepôt's.
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

        // 2. For each item the user actually filled in the checklist, record the optional
        //    empty packaging consignment + breakage loss. (These are independent of stock.)
        for (const item of items) {
            if (!item.product_id) continue;

            const emptyB = Number(item.empty_packaging_qty) || 0;
            const emptyC = Number(item.empty_secondary_packaging_qty) || 0;
            const brokenB = Number(item.broken_packaging_qty) || 0;
            const brokenC = Number(item.broken_secondary_packaging_qty) || 0;
            const depB = Number(item.packaging_deposit_value) || 0;
            const depC = Number(item.secondary_packaging_deposit_value) || 0;

            // Skip if the user didn't enter any packaging info — stock step above already handled it.
            if (emptyB <= 0 && emptyC <= 0 && brokenB <= 0 && brokenC <= 0) continue;

            const { data: product } = await supabase
                .from('products')
                .select('id, name, empty_packaging_qty, empty_secondary_packaging_qty, bottle_deposit_price, crate_deposit_price')
                .eq('id', item.product_id)
                .maybeSingle();
            if (!product) continue;

            // Consignment record (only if there are empty packages to track)
            if (emptyB > 0 || emptyC > 0) {
                const { error: consErr } = await supabase
                    .from('packaging_consignments')
                    .insert({
                        id: uuidv4(),
                        location_id: purchaseLocationId,
                        entity_type: 'supplier',
                        entity_id: supplier_id || 'unknown',
                        entity_name: supplier_name || 'Fournisseur inconnu',
                        product_id: item.product_id,
                        product_name: product.name,
                        empty_packaging_qty: emptyB,
                        empty_secondary_packaging_qty: emptyC,
                        packaging_deposit_value: depB,
                        secondary_packaging_deposit_value: depC,
                        status: 'pending',
                        source_transaction_id: purchase_id || null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                if (consErr) console.warn('⚠️ consignment insert:', consErr.message);

                // Update product empty packaging counters (+ empty received)
                const oldB = Number(product.empty_packaging_qty) || 0;
                const oldC = Number(product.empty_secondary_packaging_qty) || 0;
                const newB = oldB + emptyB;
                const newC = oldC + emptyC;

                await supabase.from('products').update({
                    empty_packaging_qty: newB,
                    empty_secondary_packaging_qty: newC
                }).eq('id', item.product_id);

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
                    notes: `Réception achat${item.notes ? ' - ' + item.notes : ''}`,
                    created_at: new Date().toISOString()
                });

                // Update stock_by_location empty packaging counters if location known
                if (purchaseLocationId) {
                    const { data: existingStock } = await supabase
                        .from('stock_by_location')
                        .select('*')
                        .eq('location_id', purchaseLocationId)
                        .eq('product_id', item.product_id)
                        .maybeSingle();
                    if (existingStock) {
                        await supabase.from('stock_by_location').update({
                            empty_packaging_qty: (Number(existingStock.empty_packaging_qty) || 0) + emptyB,
                            empty_secondary_packaging_qty: (Number(existingStock.empty_secondary_packaging_qty) || 0) + emptyC,
                            updated_at: new Date().toISOString()
                        }).eq('id', existingStock.id);
                    } else {
                        await supabase.from('stock_by_location').insert({
                            id: uuidv4(),
                            location_id: purchaseLocationId,
                            product_id: item.product_id,
                            quantity: 0,
                            empty_packaging_qty: emptyB,
                            empty_secondary_packaging_qty: emptyC
                        });
                    }
                }
            }

            // Breakage as loss (independent of empty packaging)
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
            totalDepositValue += (emptyB * depB) + (emptyC * depC);

            results.push({
                product_id: item.product_id,
                product_name: product.name,
                empty_received_bottles: emptyB,
                empty_received_crates: emptyC,
                broken_bottles: brokenB,
                broken_crates: brokenC
            });
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
                total_bottles_received: totalBottlesReceived,
                total_crates_received: totalCratesReceived,
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
            // Capture and check the result — Supabase returns errors in the
            // payload, NOT as thrown exceptions, so a try/catch alone is
            // insufficient and was causing the UI to think reception succeeded
            // while the row was never updated.
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
            totals: {
                bottles_received: totalBottlesReceived,
                crates_received: totalCratesReceived,
                bottles_broken: totalBottlesBroken,
                crates_broken: totalCratesBroken,
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
