const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Helper to synchronize customer debt stats
async function syncCustomerStats(customerId) {
    if (!customerId) return;
    try {
        const { count, error } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', customerId)
            .eq('status', 'validated')
            .gt('amount_due', 0);

        if (error) throw error;

        const unpaidCount = count || 0;
        const isBlocked = unpaidCount >= 3;

        // Ensure customer exists first
        const { data: customer } = await supabase
            .from('customers')
            .select('id, name')
            .eq('customer_id', customerId)
            .maybeSingle();

        if (customer) {
            await supabase
                .from('customers')
                .update({
                    unpaid_count: unpaidCount,
                    is_blocked: isBlocked,
                    updated_at: new Date().toISOString()
                })
                .eq('customer_id', customerId);
            console.log(`[SyncDebt] Client ${customerId} (${customer.name}): ${unpaidCount} dettes, bloqué = ${isBlocked}`);
        } else {
            console.warn(`[SyncDebt] Client introuvable pour sync: ${customerId}`);
        }
    } catch (e) {
        console.error(`[SyncDebt] Erreur pour ${customerId}:`, e.message);
    }
}

// Get all transactions
router.get('/', async (req, res) => {
    try {
        const { start_date, end_date, limit = 1000 } = req.query;

        let query = supabase.from('transactions').select('*');

        if (start_date && end_date) {
            query = query.gte('created_at', `${start_date}T00:00:00.000Z`).lte('created_at', `${end_date}T23:59:59.999Z`);
        }

        const { data: transactions, error } = await query
            .order('created_at', { ascending: false })
            .limit(parseInt(limit, 10) || 1000);

        if (error) throw error;

        // Parse items JSON for each transaction safely
        const parsedTransactions = (transactions || []).map(t => {
            let parsedItems = [];
            try {
                parsedItems = t.items ? (typeof t.items === 'string' ? JSON.parse(t.items) : t.items) : [];
            } catch (e) {
                console.error(`Error parsing items for transaction ${t.id}:`, e.message);
                parsedItems = []; // Fallback to empty array if corrupted
            }

            return {
                ...t,
                items: parsedItems,
                is_vip: Boolean(t.is_vip),
                created_date: t.created_at  // Map created_at to created_date for frontend compatibility
            };
        });
        res.json(parsedTransactions);
    } catch (error) {
        console.error('❌ Erreur GET /transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
    try {
        const { data: transaction, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        if (error) throw error;
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        try {
            transaction.items = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;
        } catch (e) {
            console.error(`Error parsing items for transaction ${transaction.id}:`, e.message);
            transaction.items = [];
        }

        transaction.is_vip = Boolean(transaction.is_vip);
        transaction.created_date = transaction.created_at;  // Map created_at to created_date
        res.json(transaction);
    } catch (error) {
        console.error('❌ Erreur GET /transactions/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create transaction
router.post('/', async (req, res) => {
    try {
        const {
            id,
            type = 'vente',
            items = [],
            total_amount,
            total, // Alias from client
            payment_method = 'cash',
            status = 'validated',
            partner_name = null,
            phone_number = null,
            transaction_ref = null,
            table_number = null,
            is_vip = false,
            amount_paid,
            amount_due,
            payment_status = 'paid',
            customer_id = null,
            customer_name = null,
            created_date,
            amount_given = 0,
            include_consignment = false,
            consignment_total = 0,
            location_id = null
        } = req.body;

        const finalTotal = total_amount !== undefined ? Number(total_amount) : (total !== undefined ? Number(total) : 0);
        const txId = id || uuidv4();
        
        const user = getUserFromRequest(req);
        const txLocationId = location_id || user.location_id || 'loc-store';

        console.log(`[Vente] Nouvelle transaction pour: ${customer_name || partner_name || 'Inconnu'} (ID: ${customer_id || 'N/A'}) (Location: ${txLocationId})`);

        // SECONDARY CHECK: Backend enforcement of debt limit
        let checkCustId = customer_id;
        if (!checkCustId && partner_name && phone_number) {
            const cleanName = partner_name.toUpperCase().replace(/\s+/g, '');
            const cleanPhone = phone_number.replace(/\s+/g, '');
            checkCustId = `${cleanName}-${cleanPhone}`;
        }

        if (checkCustId && Number(amount_due) > 0) {
            const { data: blockCheck } = await supabase
                .from('customers')
                .select('unpaid_count, is_blocked')
                .eq('customer_id', checkCustId)
                .maybeSingle();

            if (blockCheck && (blockCheck.is_blocked || Number(blockCheck.unpaid_count) >= 3)) {
                console.warn(`[Vente] BLOCAGE : Client ${checkCustId} a déjà ${blockCheck.unpaid_count} dettes.`);
                return res.status(403).json({
                    error: `Paiement bloqué : Ce client a déjà ${blockCheck.unpaid_count} dettes impayées. Veuillez régulariser sa situation.`
                });
            }
        }

        const timestamp = created_date || new Date().toISOString();
        const txDate = new Date(timestamp);

        // Generate date string ddMMyyyy from transaction date
        const day = txDate.getDate().toString().padStart(2, '0');
        const month = (txDate.getMonth() + 1).toString().padStart(2, '0');
        const year = txDate.getFullYear().toString();
        const dateStr = `${day}${month}${year}`;

        // Find all references used on this specific date to properly increment
        const { data: transactionsToday } = await supabase
            .from('transactions')
            .select('reference')
            .ilike('reference', `%-${dateStr}`);

        let nextSequence = 1;
        if (transactionsToday && transactionsToday.length > 0) {
            const sequences = transactionsToday.map(t => {
                const match = t.reference.match(/-C(\d+)-/);
                return match ? parseInt(match[1], 10) : 0;
            });
            nextSequence = Math.max(...sequences, 0) + 1;
        }

        const customerNumber = nextSequence.toString().padStart(3, '0');
        const finalTableNumber = table_number || 'T?';
        const finalReference = `${finalTableNumber}-C${customerNumber}-${dateStr}`;

        const finalAmountPaid = amount_paid !== undefined ? Number(amount_paid) : (amount_due !== undefined ? (finalTotal - Number(amount_due)) : finalTotal);
        const finalAmountDue = amount_due !== undefined ? Number(amount_due) : (amount_paid !== undefined ? (finalTotal - Number(amount_paid)) : 0);

        // 1. Insert Transaction
        const { error: insertTxErr } = await supabase
            .from('transactions')
            .insert({
                id: txId,
                reference: finalReference,
                type,
                items: JSON.stringify(items || []),
                total_amount: finalTotal,
                payment_method,
                status,
                partner_name,
                phone_number,
                transaction_ref,
                table_number: finalTableNumber,
                is_vip: Boolean(is_vip),
                amount_paid: finalAmountPaid,
                amount_due: finalAmountDue,
                payment_status,
                customer_id: checkCustId || null,
                amount_given: Number(amount_given),
                location_id: txLocationId,
                created_at: timestamp,
                updated_at: timestamp
            });

        if (insertTxErr) {
            console.error('❌ Erreur insertion transaction:', insertTxErr);
            throw insertTxErr;
        }

        // 1b. Record initial payment if any
        if (finalAmountPaid > 0) {
            await supabase
                .from('payments')
                .insert({
                    id: uuidv4(),
                    transaction_id: txId,
                    amount: finalAmountPaid,
                    payment_method,
                    created_at: timestamp
                });
        }

        // 2. Handle customer credit if there's an unpaid amount
        if (checkCustId && finalAmountDue > 0) {
            const { data: existingCustomer } = await supabase
                .from('customers')
                .select('*')
                .eq('customer_id', checkCustId)
                .maybeSingle();

            if (!existingCustomer) {
                await supabase
                    .from('customers')
                    .insert({
                        id: uuidv4(),
                        customer_id: checkCustId,
                        name: customer_name || partner_name || 'Inconnu',
                        phone_number,
                        first_transaction_date: timestamp,
                        unpaid_count: 0,
                        is_blocked: false
                    });
                console.log(`-> Client créé: ${checkCustId}`);
            }

            // Always sync after creation or update
            await syncCustomerStats(checkCustId);
        }

        // 3. Deduct stock for validated transactions
        if (status === 'validated' && items && Array.isArray(items)) {
            console.log(`-> Déduction stock pour ${items.length} articles`);
            for (const item of items) {
                if (!item || !item.product_id || !item.quantity) continue;

                const { data: product, error: productErr } = await supabase
                    .from('products')
                    .select('stock, name, track_stock, product_type, has_packaging, bottle_deposit_price, crate_deposit_price, bottles_per_crate')
                    .eq('id', item.product_id)
                    .maybeSingle();

                if (productErr) {
                    console.error(`❌ Erreur récupération produit ${item.product_id}:`, productErr);
                    throw productErr;
                }

                if (product && product.track_stock && product.product_type !== 'recipe') {
                    const newStock = Number(product.stock) - Number(item.quantity);
                    const { error: prodUpdErr } = await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
                    if (prodUpdErr) {
                        console.error(`❌ Erreur mise à jour stock produit ${item.product_id}:`, prodUpdErr);
                        throw prodUpdErr;
                    }

                    if (txLocationId) {
                        const { data: locStock, error: locStockErr } = await supabase
                            .from('stock_by_location')
                            .select('*')
                            .eq('location_id', txLocationId)
                            .eq('product_id', item.product_id)
                            .maybeSingle();
                        if (locStockErr) {
                            console.error('❌ Erreur query stock_by_location:', locStockErr);
                            throw locStockErr;
                        }

                        if (locStock) {
                            const { error: locUpdErr } = await supabase.from('stock_by_location').update({
                                quantity: Number(locStock.quantity) - Number(item.quantity),
                                updated_at: new Date().toISOString()
                            }).eq('id', locStock.id);
                            if (locUpdErr) {
                                console.error('❌ Erreur update stock_by_location:', locUpdErr);
                                throw locUpdErr;
                            }
                        } else {
                            const { error: locInsErr } = await supabase.from('stock_by_location').insert({
                                id: uuidv4(),
                                location_id: txLocationId,
                                product_id: item.product_id,
                                quantity: -Number(item.quantity)
                            });
                            if (locInsErr) {
                                console.error('❌ Erreur insert stock_by_location:', locInsErr);
                                throw locInsErr;
                            }
                        }
                    }

                    await supabase
                        .from('stock_movements')
                        .insert({
                            id: uuidv4(),
                            product_id: item.product_id,
                            product_name: product.name,
                            movement_type: 'vente',
                            quantity: -Number(item.quantity),
                            stock_before: Number(product.stock),
                            stock_after: newStock,
                            transaction_ref: finalReference,
                            notes: `Vente ${finalReference}`
                        });
                    console.log(`   - ${product.name}: ${product.stock} -> ${newStock}`);
                    
                    // Manage Packaging Returns and Consignments
                    if (product.has_packaging) {
                        const bpc = Number(product.bottles_per_crate) || 24;
                        let netBottlesConsigned = Number(item.quantity);
                        let netCratesConsigned = Math.floor(netBottlesConsigned / bpc);
                        
                        let retBottles = 0;
                        let retCrates = 0;

                        if (req.body.returned_packaging && req.body.returned_packaging[item.product_id]) {
                            const ret = req.body.returned_packaging[item.product_id];
                            retBottles = Number(ret.bottles) || 0;
                            retCrates = Number(ret.crates) || 0;
                        } else if (!include_consignment) {
                            // If no custom returns sent and consignment unchecked, default to 100% returned
                            retBottles = netBottlesConsigned;
                            retCrates = netCratesConsigned;
                        }

                        // Cap excess returning based on logic, but allow if they explicitly return more
                        let excessReturnBottles = 0;
                        let excessReturnCrates = 0;

                        if (retBottles > netBottlesConsigned) {
                            excessReturnBottles = retBottles - netBottlesConsigned;
                            netBottlesConsigned = 0;
                        } else {
                            netBottlesConsigned -= retBottles;
                        }

                        if (retCrates > netCratesConsigned) {
                            excessReturnCrates = retCrates - netCratesConsigned;
                            netCratesConsigned = 0;
                        } else {
                            netCratesConsigned -= retCrates;
                        }

                        console.log(`[PACKAGING] Product: ${product.name}, include_consignment: ${include_consignment}, retBottles: ${retBottles}, retCrates: ${retCrates}, netBottlesConsigned: ${netBottlesConsigned}, txLocationId: ${txLocationId}`);

                        // Always process returns first (add to empty stock)
                        if (retBottles > 0 || retCrates > 0) {
                            if (txLocationId) {
                                const { data: existingStock, error: extStockErr } = await supabase
                                    .from('stock_by_location')
                                    .select('*')
                                    .eq('location_id', txLocationId)
                                    .eq('product_id', item.product_id)
                                    .maybeSingle();
                                if (extStockErr) throw extStockErr;
 
                                if (existingStock) {
                                    const { error: extUpdErr } = await supabase.from('stock_by_location').update({
                                        empty_packaging_qty: (Number(existingStock.empty_packaging_qty) || 0) + retBottles,
                                        empty_secondary_packaging_qty: (Number(existingStock.empty_secondary_packaging_qty) || 0) + retCrates,
                                        updated_at: new Date().toISOString()
                                    }).eq('id', existingStock.id);
                                    if (extUpdErr) throw extUpdErr;
                                } else {
                                    const { error: extInsErr } = await supabase.from('stock_by_location').insert({
                                        id: uuidv4(),
                                        location_id: txLocationId,
                                        product_id: item.product_id,
                                        quantity: 0,
                                        empty_packaging_qty: retBottles,
                                        empty_secondary_packaging_qty: retCrates
                                    });
                                    if (extInsErr) throw extInsErr;
                                }
                            }
 
                            const { error: pmReturnErr } = await supabase.from('packaging_movements').insert({
                                id: uuidv4(),
                                location_id: txLocationId || null,
                                product_id: item.product_id,
                                product_name: product.name,
                                movement_type: 'consignment_return',
                                empty_packaging_qty: retBottles,
                                empty_secondary_packaging_qty: retCrates,
                                source_type: 'transaction',
                                source_id: txId,
                                notes: `Retour direct (Vente ${finalReference})`,
                                created_at: timestamp
                            });
                            if (pmReturnErr) throw pmReturnErr;
                        }
 
                        // Consign the rest ONLY if include_consignment is true
                        if (include_consignment && (netBottlesConsigned > 0 || netCratesConsigned > 0)) {
                            const { error: pcErr } = await supabase.from('packaging_consignments').insert({
                                id: uuidv4(),
                                location_id: txLocationId || null,
                                entity_type: 'customer',
                                entity_id: checkCustId || 'client_divers',
                                entity_name: customer_name || partner_name || 'Client Divers',
                                product_id: item.product_id,
                                product_name: product.name,
                                empty_packaging_qty: netBottlesConsigned,
                                empty_secondary_packaging_qty: netCratesConsigned,
                                packaging_deposit_value: Number(product.bottle_deposit_price) || 0,
                                secondary_packaging_deposit_value: Number(product.crate_deposit_price) || 0,
                                status: 'pending',
                                source_transaction_id: txId,
                                created_at: timestamp,
                                updated_at: timestamp
                            });
                            if (pcErr) throw pcErr;

                            // ✅ INCRÉMENTER LA DETTE D'EMBALLAGES DU CLIENT
                            if (checkCustId && checkCustId !== 'client_divers') {
                                const { data: cust } = await supabase
                                    .from('customers')
                                    .select('id, packaging_debt_bottles, packaging_debt_crates')
                                    .eq('customer_id', checkCustId)
                                    .maybeSingle();
                                if (cust) {
                                    await supabase.from('customers').update({
                                        packaging_debt_bottles: (Number(cust.packaging_debt_bottles) || 0) + netBottlesConsigned,
                                        packaging_debt_crates: (Number(cust.packaging_debt_crates) || 0) + netCratesConsigned,
                                        updated_at: new Date().toISOString()
                                    }).eq('id', cust.id);
                                }
                            }

                            const { error: pmOutErr } = await supabase.from('packaging_movements').insert({
                                id: uuidv4(),
                                location_id: txLocationId || null,
                                product_id: item.product_id,
                                product_name: product.name,
                                movement_type: 'consignment_out',
                                empty_packaging_qty: netBottlesConsigned,
                                empty_secondary_packaging_qty: netCratesConsigned,
                                source_type: 'transaction',
                                source_id: txId,
                                notes: `Consigne nette client (Vente ${finalReference})`,
                                created_at: timestamp
                            });
                            if (pmOutErr) throw pmOutErr;
                        }

                        // Process excess returns against past debts
                        if ((excessReturnBottles > 0 || excessReturnCrates > 0) && checkCustId) {
                            const { data: pendingCons } = await supabase.from('packaging_consignments')
                                .select('*').eq('entity_type', 'customer').eq('entity_id', checkCustId).eq('product_id', item.product_id).eq('status', 'pending').order('created_at', { ascending: true });
                            
                            let remainB = excessReturnBottles;
                            let remainC = excessReturnCrates;
                            for (const c of pendingCons || []) {
                                if (remainB <= 0 && remainC <= 0) break;
                                const bReturn = Math.min(Number(c.empty_packaging_qty) || 0, remainB);
                                const cReturn = Math.min(Number(c.empty_secondary_packaging_qty) || 0, remainC);
                                remainB -= bReturn;
                                remainC -= cReturn;
                                const nB = (Number(c.empty_packaging_qty) || 0) - bReturn;
                                const nC = (Number(c.empty_secondary_packaging_qty) || 0) - cReturn;
                                await supabase.from('packaging_consignments').update({
                                    empty_packaging_qty: nB, empty_secondary_packaging_qty: nC, status: (nB === 0 && nC === 0) ? 'returned' : 'pending', updated_at: new Date().toISOString()
                                }).eq('id', c.id);
                            }
                        }
                    }
                } else if (product && product.product_type === 'recipe') {
                    // Deduct raw materials according to recipe
                    const { data: recipeRows } = await supabase
                        .from('recipes')
                        .select('*')
                        .eq('product_id', item.product_id);

                    for (const row of recipeRows || []) {
                        const consumption = Number(item.quantity) * (Number(row.quantity_per_batch) / Number(row.batch_size));
                        const { data: mat } = await supabase
                            .from('products')
                            .select('stock, name, unit')
                            .eq('id', row.raw_material_id)
                            .maybeSingle();

                        if (!mat) continue;

                        const newMatStock = Number(mat.stock) - consumption;
                        await supabase.from('products').update({ stock: newMatStock }).eq('id', row.raw_material_id);

                        await supabase
                            .from('ingredient_movements')
                            .insert({
                                id: uuidv4(),
                                ingredient_id: row.raw_material_id,
                                ingredient_name: mat.name,
                                unit: mat.unit || null,
                                movement_type: 'vente_recette',
                                quantity: -consumption,
                                stock_before: Number(mat.stock),
                                stock_after: newMatStock,
                                notes: `Recette: ${product.name} x${item.quantity} (${finalReference})`
                            });
                        console.log(`   [Recette] ${mat.name}: ${mat.stock} -> ${newMatStock} (consommé: ${consumption})`);
                    }
                } else if (product && !product.track_stock) {
                    console.log(`   - ${product.name}: Produit non-stock, pas de déduction`);
                } else {
                    console.warn(`[Stock] Produit introuvable: ${item.product_id}`);
                }
            }
        }

        const { data: transaction } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', txId)
            .single();

        if (transaction) {
            transaction.items = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;
            transaction.is_vip = Boolean(transaction.is_vip);
            transaction.created_date = transaction.created_at;

            // Audit log
            const user = getUserFromRequest(req);
            createAuditLog(
                user.id,
                user.username,
                'CREATE_TRANSACTION',
                'transaction',
                txId,
                {
                    reference: transaction.reference,
                    type: transaction.type,
                    total_amount: transaction.total_amount,
                    payment_method: transaction.payment_method,
                    status: transaction.status,
                    customer_id: transaction.customer_id
                }
            );

            res.status(201).json(transaction);
        } else {
            throw new Error('Transaction created but could not be retrieved');
        }
    } catch (error) {
        console.error('❌ Erreur POST /transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update transaction details
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            items,
            total_amount,
            total, // Alias
            payment_method,
            status,
            partner_name,
            phone_number,
            transaction_ref,
            table_number,
            is_vip,
            amount_paid,
            amount_due,
            payment_status,
            customer_id,
            amount_given,
            include_consignment,
            consignment_total
        } = req.body;

        const finalInputTotal = total_amount !== undefined ? total_amount : total;

        const { data: currentTransaction, error: getErr } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getErr) throw getErr;
        if (!currentTransaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Backend check for blocked customer
        const finalCustId = customer_id !== undefined ? customer_id : currentTransaction.customer_id;
        const finalDue = amount_due !== undefined ? amount_due : currentTransaction.amount_due;
        if (finalCustId && finalDue > 0 && finalDue > (currentTransaction.amount_due || 0)) {
            const { data: blockCheck } = await supabase
                .from('customers')
                .select('unpaid_count, is_blocked')
                .eq('customer_id', finalCustId)
                .maybeSingle();

            if (blockCheck && (blockCheck.is_blocked || Number(blockCheck.unpaid_count) >= 3)) {
                return res.status(403).json({
                    error: `Action bloquée : Le client ${finalCustId} a déjà ${blockCheck.unpaid_count} dettes.`
                });
            }
        }

        let oldItems = [];
        try {
            oldItems = typeof currentTransaction.items === 'string' ? JSON.parse(currentTransaction.items) : currentTransaction.items;
        } catch (e) {
            console.error('Error parsing old items:', e.message);
        }

        console.log(`Updating transaction ${id}, current status: ${currentTransaction.status}`);

        // Only update stock if items are provided in the request
        if (items) {
            // 1. Reverse old stock movements ONLY if transaction was previously validated
            if (Array.isArray(oldItems) && currentTransaction.status === 'validated') {
                for (const item of oldItems) {
                    if (item && item.product_id && item.quantity) {
                        const { data: product } = await supabase.from('products').select('stock, track_stock, product_type').eq('id', item.product_id).maybeSingle();
                        if (product && product.track_stock && product.product_type !== 'recipe') {
                            await supabase.from('products').update({ stock: Number(product.stock) + Number(item.quantity) }).eq('id', item.product_id);
                        } else if (product && product.product_type === 'recipe') {
                            const { data: recipeRows } = await supabase.from('recipes').select('*').eq('product_id', item.product_id);
                            for (const row of recipeRows || []) {
                                const consumption = Number(item.quantity) * (Number(row.quantity_per_batch) / Number(row.batch_size));
                                const { data: mat } = await supabase.from('products').select('stock').eq('id', row.raw_material_id).maybeSingle();
                                if (mat) {
                                    await supabase.from('products').update({ stock: Number(mat.stock) + consumption }).eq('id', row.raw_material_id);
                                }
                            }
                        }
                    }
                }
            }

            // 2. Apply new stock movements ONLY if the new status is validated
            const newStatus = status !== undefined ? status : currentTransaction.status;
            if (newStatus === 'validated') {
                const txLocationId = currentTransaction.location_id || 'loc-store';
                const finalReference = currentTransaction.reference;
                const timestamp = new Date().toISOString();
                const checkCustId = customer_id || currentTransaction.customer_id || 'client_divers';
                const custName = partner_name || currentTransaction.partner_name || 'Client Divers';

                for (const item of items) {
                    if (!item || !item.product_id || !item.quantity) continue;

                    const { data: product, error: productErr } = await supabase
                        .from('products')
                        .select('stock, name, track_stock, product_type, has_packaging, bottle_deposit_price, crate_deposit_price, bottles_per_crate')
                        .eq('id', item.product_id)
                        .maybeSingle();

                    if (productErr) {
                        console.error(`❌ Erreur récupération produit ${item.product_id}:`, productErr);
                        throw productErr;
                    }

                    if (product && product.track_stock && product.product_type !== 'recipe') {
                        const newStock = Number(product.stock) - Number(item.quantity);
                        const { error: prodUpdErr } = await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
                        if (prodUpdErr) {
                            console.error(`❌ Erreur mise à jour stock produit ${item.product_id}:`, prodUpdErr);
                            throw prodUpdErr;
                        }

                        if (txLocationId) {
                            const { data: locStock, error: locStockErr } = await supabase
                                .from('stock_by_location')
                                .select('*')
                                .eq('location_id', txLocationId)
                                .eq('product_id', item.product_id)
                                .maybeSingle();
                            if (locStockErr) {
                                console.error('❌ Erreur query stock_by_location:', locStockErr);
                                throw locStockErr;
                            }

                            if (locStock) {
                                const { error: locUpdErr } = await supabase.from('stock_by_location').update({
                                    quantity: Number(locStock.quantity) - Number(item.quantity),
                                    updated_at: new Date().toISOString()
                                }).eq('id', locStock.id);
                                if (locUpdErr) {
                                    console.error('❌ Erreur update stock_by_location:', locUpdErr);
                                    throw locUpdErr;
                                }
                            } else {
                                const { error: locInsErr } = await supabase.from('stock_by_location').insert({
                                    id: uuidv4(),
                                    location_id: txLocationId,
                                    product_id: item.product_id,
                                    quantity: -Number(item.quantity)
                                });
                                if (locInsErr) {
                                    console.error('❌ Erreur insert stock_by_location:', locInsErr);
                                    throw locInsErr;
                                }
                            }
                        }

                        await supabase
                            .from('stock_movements')
                            .insert({
                                id: uuidv4(),
                                product_id: item.product_id,
                                product_name: product.name,
                                movement_type: 'vente',
                                quantity: -Number(item.quantity),
                                stock_before: Number(product.stock),
                                stock_after: newStock,
                                transaction_ref: finalReference,
                                notes: `Vente (Modification/Validation ${finalReference})`
                            });
                        console.log(`   - ${product.name}: ${product.stock} -> ${newStock}`);

                        // Manage Packaging Returns and Consignments
                        if (product.has_packaging) {
                            const bpc = Number(product.bottles_per_crate) || 24;
                            let netBottlesConsigned = Number(item.quantity);
                            let netCratesConsigned = Math.floor(netBottlesConsigned / bpc);

                            let retBottles = 0;
                            let retCrates = 0;

                            if (req.body.returned_packaging && req.body.returned_packaging[item.product_id]) {
                                const ret = req.body.returned_packaging[item.product_id];
                                retBottles = Number(ret.bottles) || 0;
                                retCrates = Number(ret.crates) || 0;
                            } else if (!include_consignment) {
                                // If no custom returns sent and consignment unchecked, default to 100% returned
                                retBottles = netBottlesConsigned;
                                retCrates = netCratesConsigned;
                            }

                            // Cap excess returning based on logic, but allow if they explicitly return more
                            let excessReturnBottles = 0;
                            let excessReturnCrates = 0;

                            if (retBottles > netBottlesConsigned) {
                                excessReturnBottles = retBottles - netBottlesConsigned;
                                netBottlesConsigned = 0;
                            } else {
                                netBottlesConsigned -= retBottles;
                            }

                            if (retCrates > netCratesConsigned) {
                                excessReturnCrates = retCrates - netCratesConsigned;
                                netCratesConsigned = 0;
                            } else {
                                netCratesConsigned -= retCrates;
                            }

                            console.log(`[PACKAGING PUT] Product: ${product.name}, include_consignment: ${include_consignment}, retBottles: ${retBottles}, retCrates: ${retCrates}, netBottlesConsigned: ${netBottlesConsigned}, txLocationId: ${txLocationId}`);

                            // Always process returns first (add to empty stock)
                            if (retBottles > 0 || retCrates > 0) {
                                if (txLocationId) {
                                    const { data: existingStock, error: extStockErr } = await supabase
                                        .from('stock_by_location')
                                        .select('*')
                                        .eq('location_id', txLocationId)
                                        .eq('product_id', item.product_id)
                                        .maybeSingle();
                                    if (extStockErr) throw extStockErr;

                                    if (existingStock) {
                                        const { error: extUpdErr } = await supabase.from('stock_by_location').update({
                                            empty_packaging_qty: (Number(existingStock.empty_packaging_qty) || 0) + retBottles,
                                            empty_secondary_packaging_qty: (Number(existingStock.empty_secondary_packaging_qty) || 0) + retCrates,
                                            updated_at: new Date().toISOString()
                                        }).eq('id', existingStock.id);
                                        if (extUpdErr) throw extUpdErr;
                                    } else {
                                        const { error: extInsErr } = await supabase.from('stock_by_location').insert({
                                            id: uuidv4(),
                                            location_id: txLocationId,
                                            product_id: item.product_id,
                                            quantity: 0,
                                            empty_packaging_qty: retBottles,
                                            empty_secondary_packaging_qty: retCrates
                                        });
                                        if (extInsErr) throw extInsErr;
                                    }
                                }

                                const { error: pmReturnErr } = await supabase.from('packaging_movements').insert({
                                    id: uuidv4(),
                                    location_id: txLocationId || null,
                                    product_id: item.product_id,
                                    product_name: product.name,
                                    movement_type: 'consignment_return',
                                    empty_packaging_qty: retBottles,
                                    empty_secondary_packaging_qty: retCrates,
                                    source_type: 'transaction',
                                    source_id: id,
                                    notes: `Retour direct (Modification/Validation Vente ${finalReference})`,
                                    created_at: timestamp
                                });
                                if (pmReturnErr) throw pmReturnErr;
                            }

                            // Consign the rest ONLY if include_consignment is true
                            if (include_consignment && (netBottlesConsigned > 0 || netCratesConsigned > 0)) {
                                const { error: pcErr } = await supabase.from('packaging_consignments').insert({
                                    id: uuidv4(),
                                    location_id: txLocationId || null,
                                    entity_type: 'customer',
                                    entity_id: checkCustId || 'client_divers',
                                    entity_name: custName,
                                    product_id: item.product_id,
                                    product_name: product.name,
                                    empty_packaging_qty: netBottlesConsigned,
                                    empty_secondary_packaging_qty: netCratesConsigned,
                                    packaging_deposit_value: Number(product.bottle_deposit_price) || 0,
                                    secondary_packaging_deposit_value: Number(product.crate_deposit_price) || 0,
                                    status: 'pending',
                                    source_transaction_id: id,
                                    created_at: timestamp,
                                    updated_at: timestamp
                                });
                                if (pcErr) throw pcErr;

                                // ✅ INCRÉMENTER LA DETTE D'EMBALLAGES DU CLIENT
                                if (checkCustId && checkCustId !== 'client_divers') {
                                    const { data: cust } = await supabase
                                        .from('customers')
                                        .select('id, packaging_debt_bottles, packaging_debt_crates')
                                        .eq('customer_id', checkCustId)
                                        .maybeSingle();
                                    if (cust) {
                                        await supabase.from('customers').update({
                                            packaging_debt_bottles: (Number(cust.packaging_debt_bottles) || 0) + netBottlesConsigned,
                                            packaging_debt_crates: (Number(cust.packaging_debt_crates) || 0) + netCratesConsigned,
                                            updated_at: new Date().toISOString()
                                        }).eq('id', cust.id);
                                    }
                                }

                                const { error: pmOutErr } = await supabase.from('packaging_movements').insert({
                                    id: uuidv4(),
                                    location_id: txLocationId || null,
                                    product_id: item.product_id,
                                    product_name: product.name,
                                    movement_type: 'consignment_out',
                                    empty_packaging_qty: netBottlesConsigned,
                                    empty_secondary_packaging_qty: netCratesConsigned,
                                    source_type: 'transaction',
                                    source_id: id,
                                    notes: `Consigne client (Modification/Validation Vente ${finalReference})`,
                                    created_at: timestamp
                                });
                                if (pmOutErr) throw pmOutErr;
                            }
                        }
                    } else if (product && product.product_type === 'recipe') {
                        const { data: recipeRows } = await supabase.from('recipes').select('*').eq('product_id', item.product_id);
                        for (const row of recipeRows || []) {
                            const consumption = Number(item.quantity) * (Number(row.quantity_per_batch) / Number(row.batch_size));
                            const { data: mat } = await supabase.from('products').select('stock, name, unit').eq('id', row.raw_material_id).maybeSingle();
                            if (!mat) continue;
                            const newMatStock = Number(mat.stock) - consumption;
                            await supabase.from('products').update({ stock: newMatStock }).eq('id', row.raw_material_id);

                            await supabase.from('ingredient_movements').insert({
                                id: uuidv4(),
                                ingredient_id: row.raw_material_id,
                                ingredient_name: mat.name,
                                unit: mat.unit || null,
                                movement_type: 'vente_recette',
                                quantity: -consumption,
                                stock_before: Number(mat.stock),
                                stock_after: newMatStock,
                                notes: `Recette: ${product.name} x${item.quantity} (${finalReference})`
                            });
                        }
                    }
                }
            }
        }

        // 3. Update transaction record
        const finalItems = items !== undefined ? JSON.stringify(items) : currentTransaction.items;
        const finalTotal = finalInputTotal !== undefined ? finalInputTotal : currentTransaction.total_amount;
        const finalPaymentMethod = payment_method !== undefined ? payment_method : currentTransaction.payment_method;
        const finalStatus = status !== undefined ? status : currentTransaction.status;
        const finalPartnerName = partner_name !== undefined ? partner_name : currentTransaction.partner_name;
        const finalPhoneNumber = phone_number !== undefined ? phone_number : currentTransaction.phone_number;
        const finalTransactionRef = transaction_ref !== undefined ? transaction_ref : currentTransaction.transaction_ref;
        const finalTableNumber = table_number !== undefined ? table_number : currentTransaction.table_number;
        const finalIsVip = is_vip !== undefined ? Boolean(is_vip) : currentTransaction.is_vip;
        const finalAmountPaid = amount_paid !== undefined ? amount_paid : currentTransaction.amount_paid;
        const finalAmountDue = amount_due !== undefined ? amount_due : currentTransaction.amount_due;
        const finalPaymentStatus = payment_status !== undefined ? payment_status : currentTransaction.payment_status;
        const finalAmountGiven = amount_given !== undefined ? amount_given : currentTransaction.amount_given;

        await supabase.from('transactions').update({
            items: finalItems,
            total_amount: finalTotal,
            payment_method: finalPaymentMethod,
            status: finalStatus,
            partner_name: finalPartnerName,
            phone_number: finalPhoneNumber,
            transaction_ref: finalTransactionRef,
            table_number: finalTableNumber,
            is_vip: finalIsVip,
            amount_paid: finalAmountPaid,
            amount_due: finalAmountDue,
            payment_status: finalPaymentStatus,
            customer_id: finalCustId,
            amount_given: finalAmountGiven,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        // 2b. Record payment if amount_paid increased
        if (amount_paid !== undefined && Number(amount_paid) > Number(currentTransaction.amount_paid || 0)) {
            const paymentDelta = Number(amount_paid) - Number(currentTransaction.amount_paid || 0);
            await supabase.from('payments').insert({
                id: uuidv4(),
                transaction_id: id,
                amount: paymentDelta,
                payment_method: payment_method || currentTransaction.payment_method,
                note: `Complément paiement (Modification)`,
                created_at: new Date().toISOString()
            });
        }

        // 3. Ensure customer record exists before syncing
        if (finalCustId && Number(finalAmountDue) > 0) {
            const { data: existingCustomer } = await supabase.from('customers').select('id').eq('customer_id', finalCustId).maybeSingle();
            if (!existingCustomer) {
                await supabase.from('customers').insert({
                    id: uuidv4(),
                    customer_id: finalCustId,
                    name: finalPartnerName || 'Inconnu',
                    phone_number: finalPhoneNumber || '',
                    first_transaction_date: new Date().toISOString(),
                    unpaid_count: 0,
                    is_blocked: false
                });
                console.log(`-> Client créé (mode table): ${finalCustId}`);
            }
        }

        // 4. Sync customer stats after update
        if (finalCustId) await syncCustomerStats(finalCustId);
        // Also sync old customer if it was changed
        if (currentTransaction.customer_id && currentTransaction.customer_id !== finalCustId) {
            await syncCustomerStats(currentTransaction.customer_id);
        }

        const { data: updatedTransaction } = await supabase.from('transactions').select('*').eq('id', id).single();
        if (updatedTransaction) {
            updatedTransaction.items = typeof updatedTransaction.items === 'string' ? JSON.parse(updatedTransaction.items) : updatedTransaction.items;
            updatedTransaction.is_vip = Boolean(updatedTransaction.is_vip);

            const user = getUserFromRequest(req);
            createAuditLog(
                user.id, user.username, 'UPDATE_TRANSACTION', 'transaction', id,
                {
                    reference: updatedTransaction.reference,
                    status: updatedTransaction.status,
                    total_amount: updatedTransaction.total_amount,
                    payment_status: updatedTransaction.payment_status,
                    amount_paid: updatedTransaction.amount_paid,
                    amount_due: updatedTransaction.amount_due
                }
            );
            res.json(updatedTransaction);
        } else {
            res.status(500).json({ error: 'Failed to retrieve updated transaction' });
        }
    } catch (error) {
        console.error('❌ Erreur PUT /transactions/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression de la transaction: ${id}`);

        const { data: transaction, error: getErr } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
        if (getErr) throw getErr;
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction non trouvée' });
        }

        let items = [];
        try {
            items = transaction.items ? (typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items) : [];
        } catch (e) {
            console.warn(`[Delete] Erreur de parsing items pour ${id}, poursuite sans restoration stock précise.`);
        }

        // 1. Restore stock ONLY if transaction was validated
        if (transaction.status === 'validated' && Array.isArray(items)) {
            for (const item of items) {
                if (item && item.product_id && item.quantity) {
                    const { data: product } = await supabase.from('products').select('stock, name, track_stock, product_type').eq('id', item.product_id).maybeSingle();

                    if (product && product.track_stock && product.product_type !== 'recipe') {
                        const newStock = Number(product.stock) + Number(item.quantity);
                        await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
                        
                        await supabase.from('stock_movements').insert({
                            id: uuidv4(),
                            product_id: item.product_id,
                            product_name: product.name,
                            movement_type: 'annulation',
                            quantity: Number(item.quantity),
                            stock_before: Number(product.stock),
                            stock_after: newStock,
                            transaction_ref: transaction.reference,
                            notes: `Annulation vente ${transaction.reference}`
                        });
                        console.log(`[Delete] Restored stock for ${product.name}: ${product.stock} -> ${newStock}`);
                    } else if (product && product.product_type === 'recipe') {
                        const { data: recipeRows } = await supabase.from('recipes').select('*').eq('product_id', item.product_id);
                        for (const row of recipeRows || []) {
                            const consumption = Number(item.quantity) * (Number(row.quantity_per_batch) / Number(row.batch_size));
                            const { data: mat } = await supabase.from('products').select('stock, name, unit').eq('id', row.raw_material_id).maybeSingle();
                            if (!mat) continue;
                            const newMatStock = Number(mat.stock) + consumption;
                            await supabase.from('products').update({ stock: newMatStock }).eq('id', row.raw_material_id);
                            
                            await supabase.from('ingredient_movements').insert({
                                id: uuidv4(),
                                ingredient_id: row.raw_material_id,
                                ingredient_name: mat.name,
                                unit: mat.unit || null,
                                movement_type: 'annulation_recette',
                                quantity: consumption,
                                stock_before: Number(mat.stock),
                                stock_after: newMatStock,
                                notes: `Annulation recette: ${product.name} x${item.quantity} (${transaction.reference})`
                            });
                            console.log(`[Delete] Restored raw material ${mat.name}: ${mat.stock} -> ${newMatStock}`);
                        }
                    }
                }
            }
        }

        // Audit log before deletion
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id, user.username, 'DELETE_TRANSACTION', 'transaction', id,
            {
                reference: transaction.reference,
                type: transaction.type,
                total_amount: transaction.total_amount,
                status: transaction.status,
                customer_id: transaction.customer_id
            }
        );

        // 2. Delete transaction (and payments via CASCADE in PostgreSQL)
        await supabase.from('transactions').delete().eq('id', id);

        if (transaction.customer_id) {
            console.log(`[Delete] Re-syncing stats for customer ${transaction.customer_id} after transaction deletion`);
            await syncCustomerStats(transaction.customer_id);
        }

        res.json({ message: 'Transaction supprimée avec succès', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /transactions/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update transaction payment
router.put('/:id/payment', async (req, res) => {
    const { id } = req.params;
    const { amount_paid, amount_due, payment_status, payment_method, transaction_ref } = req.body;

    try {
        const { data: originalTx, error: getErr } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
        if (getErr) throw getErr;
        if (!originalTx) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const paymentDelta = Number(amount_paid) - Number(originalTx.amount_paid || 0);
        if (paymentDelta <= 0) {
            return res.json(originalTx);
        }

        // 1. Update original transaction (settle the debt)
        await supabase.from('transactions').update({
            amount_due: amount_due,
            payment_status: payment_status,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        // 2. Create the NEW transaction for the payment today (Règlement)
        const now = new Date();
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear().toString();
        const dateStr = `${day}${month}${year}`;

        const { data: regToday } = await supabase.from('transactions').select('reference').ilike('reference', `REG-C%-${dateStr}`);
        let nextSeq = 1;
        if (regToday && regToday.length > 0) {
            const sequences = regToday.map(t => {
                const match = t.reference.match(/REG-C(\d+)-/);
                return match ? parseInt(match[1], 10) : 0;
            });
            nextSeq = Math.max(...sequences, 0) + 1;
        }
        const regRef = `REG-C${nextSeq}-${dateStr}`;
        const regId = uuidv4();

        await supabase.from('transactions').insert({
            id: regId,
            reference: regRef,
            type: 'reglement',
            items: '[]',
            total_amount: 0,
            payment_method,
            status: 'validated',
            partner_name: originalTx.partner_name,
            phone_number: originalTx.phone_number,
            transaction_ref: transaction_ref || null,
            is_vip: false,
            amount_paid: paymentDelta,
            amount_due: 0,
            payment_status: 'paid',
            customer_id: originalTx.customer_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        // 3. Record in payments table (for accounting/cash reports)
        await supabase.from('payments').insert({
            id: uuidv4(),
            transaction_id: regId,
            amount: paymentDelta,
            payment_method,
            note: `Règlement facture ${originalTx.reference}`,
            created_at: new Date().toISOString()
        });

        // 4. Update customer status if needed
        if (originalTx.customer_id) {
            console.log(`[Payment] Syncing stats for customer ${originalTx.customer_id} after payment on ${originalTx.reference}`);
            await syncCustomerStats(originalTx.customer_id);
        }

        const { data: updatedTransaction } = await supabase.from('transactions').select('*').eq('id', id).single();
        if (updatedTransaction) {
            updatedTransaction.items = typeof updatedTransaction.items === 'string' ? JSON.parse(updatedTransaction.items) : updatedTransaction.items;
            updatedTransaction.is_vip = Boolean(updatedTransaction.is_vip);
            updatedTransaction.created_date = updatedTransaction.created_at;
            res.json(updatedTransaction);
        } else {
            res.status(500).json({ error: 'Failed to retrieve updated transaction' });
        }
    } catch (error) {
        console.error('❌ Erreur PUT /transactions/:id/payment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all payments
router.get('/payments/all', async (req, res) => {
    try {
        const { data: payments, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(payments || []);
    } catch (error) {
        console.error('❌ Erreur GET /payments/all:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get transaction statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: todayTxs, error: tErr } = await supabase
            .from('transactions')
            .select('total_amount')
            .eq('type', 'vente')
            .gte('created_at', `${today}T00:00:00.000Z`)
            .lte('created_at', `${today}T23:59:59.999Z`);
        
        if (tErr) throw tErr;

        const todaySales = (todayTxs || []).reduce((sum, t) => sum + Number(t.total_amount), 0);
        const todayCount = (todayTxs || []).length;

        const { data: allTxs, error: allErr } = await supabase
            .from('transactions')
            .select('total_amount')
            .eq('type', 'vente');
        
        if (allErr) throw allErr;

        const totalSales = (allTxs || []).reduce((sum, t) => sum + Number(t.total_amount), 0);

        res.json({
            todaySales,
            todayCount,
            totalSales
        });
    } catch (error) {
        console.error('❌ Erreur GET /stats/summary:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
