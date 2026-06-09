const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { createAuditLog } = require('../middleware/auditLogger');
const { v4: uuidv4 } = require('uuid');
const { unwrapMissingColumn } = require('../services/degradedMode');

// Authentification
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(authHeader.substring(7), JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Obtenir tous les transferts liés à mon emplacement (ou tous si admin)
router.get('/', requireAuth, async (req, res) => {
    try {
        let query = supabase
            .from('stock_transfers')
            .select(`
                *,
                stock_transfer_items (*, products(id, name)),
                from_loc:locations!stock_transfers_from_location_id_fkey(name),
                to_loc:locations!stock_transfers_to_location_id_fkey(name)
            `)
            .order('created_at', { ascending: false });

        if (req.user.role !== 'admin' && req.user.location_id) {
            query = query.or(`from_location_id.eq.${req.user.location_id},to_location_id.eq.${req.user.location_id}`);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Étape 1 : Initier un transfert (Expédition)
router.post('/send', requireAuth, async (req, res) => {
    try {
        const { to_location_id, items, notes } = req.body; // items: [{product_id, quantity, empty_packaging_qty, empty_secondary_packaging_qty}]
        const from_location_id = req.user.location_id; // Seul l'emplacement de l'utilisateur peut envoyer
        
        if (!from_location_id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Vous n\'êtes assigné à aucun emplacement.' });
        }
        
        const actualFromLocationId = from_location_id || req.body.from_location_id; // admin peut choisir

        if (!actualFromLocationId || !to_location_id || !items || !items.length) {
            console.error('❌ [send] Données manquantes:', { actualFromLocationId, to_location_id, itemsLength: items?.length });
            return res.status(400).json({ error: 'Données manquantes: origine, destination et articles requis.' });
        }

        // Vérifier que le service_role_key est utilisée (sinon RLS bloquera)
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('⚠️ [send] SUPABASE_SERVICE_ROLE_KEY non définie — le serveur utilise la clé ANON. Les opérations INSERT/UPDATE seront bloquées par RLS.');
        }

        const transferId = uuidv4();
        const reference = `EPK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`;

        // Déterminer le type de transfert selon le contenu
        const hasPackagingItems = items.some(i => (i.empty_packaging_qty || 0) > 0 || (i.empty_secondary_packaging_qty || 0) > 0);
        const hasProductItems = items.some(i => (i.quantity || 0) > 0);
        const transferType = hasPackagingItems && !hasProductItems ? 'empty_packaging' : 'regular';

        // Créer l'entête du transfert
        const { error: headerErr } = await supabase
            .from('stock_transfers')
            .insert([{
                id: transferId,
                reference,
                from_location_id: actualFromLocationId,
                to_location_id,
                transfer_type: transferType,
                status: 'in_transit',
                notes,
                created_by: req.user.id,
                shipped_at: new Date().toISOString()
            }]);
            
        if (headerErr) {
            console.error('❌ [send] Erreur INSERT stock_transfers:', headerErr);
            if (/row-level security/i.test(headerErr.message || '')) {
                return res.status(403).json({ error: 'Erreur RLS: Le serveur n\'a pas les droits d\'écriture sur stock_transfers. Vérifiez SUPABASE_SERVICE_ROLE_KEY et les politiques RLS.' });
            }
            throw headerErr;
        }

        // Insérer les lignes et déduire le stock du site expéditeur
        for (const item of items) {
            const itemId = uuidv4();

            // Récupérer le nom du produit pour l'audit et l'affichage dans le modal
            const { data: prodInfo } = await supabase
                .from('products')
                .select('name')
                .eq('id', item.product_id)
                .maybeSingle();

            const itemPayload = {
                id: itemId,
                transfer_id: transferId,
                product_id: item.product_id,
                product_name: prodInfo?.name || item.product_name || null,
                quantity: item.quantity || 0,
                empty_packaging_qty: item.empty_packaging_qty || 0,
                empty_secondary_packaging_qty: item.empty_secondary_packaging_qty || 0,
                // Colonnes optionnelles ajoutées par la migration — on les ignore si absentes
                sent_empty_packaging_qty: item.empty_packaging_qty || 0,
                sent_empty_secondary_packaging_qty: item.empty_secondary_packaging_qty || 0
            };

            // Tolérance colonnes optionnelles
            const OPTIONAL_ITEM_INSERT_COLS = ['product_name', 'sent_empty_packaging_qty', 'sent_empty_secondary_packaging_qty'];
            let insertPayload = { ...itemPayload };
            for (let attempt = 0; attempt <= OPTIONAL_ITEM_INSERT_COLS.length; attempt++) {
                const { error: itemErr } = await supabase.from('stock_transfer_items').insert([insertPayload]);
                if (!itemErr) break;
                const msg = (itemErr.message || '').toString();
                if (!/Could not find the .* column .* in the schema cache/i.test(msg)) throw itemErr;
                const missingCol = OPTIONAL_ITEM_INSERT_COLS.find(c => msg.includes(`'${c}'`));
                if (!missingCol) throw itemErr;
                console.warn(`⚠️ [degraded-mode] stock_transfer_items.${missingCol} absent — bascule sans cette colonne.`);
                const slim = { ...insertPayload };
                delete slim[missingCol];
                insertPayload = slim;
            }

            const qtyToDeduct = item.quantity || 0;
            const emptyToDeduct = item.empty_packaging_qty || 0;
            const secondaryToDeduct = item.empty_secondary_packaging_qty || 0;

            // Déduire le stock par emplacement (maybeSingle pour éviter l'erreur si pas de row)
            const { data: stockBefore, error: stockErr } = await supabase
                .from('stock_by_location')
                .select('*')
                .eq('location_id', actualFromLocationId)
                .eq('product_id', item.product_id)
                .maybeSingle();

            if (stockErr) {
                console.error('⚠️ Erreur lecture stock_by_location:', stockErr.message);
            }

            if (stockBefore) {
                const { error: updateErr } = await supabase.from('stock_by_location')
                    .update({
                        quantity: Math.max(0, (stockBefore.quantity || 0) - qtyToDeduct),
                        empty_packaging_qty: Math.max(0, (stockBefore.empty_packaging_qty || 0) - emptyToDeduct),
                        empty_secondary_packaging_qty: Math.max(0, (stockBefore.empty_secondary_packaging_qty || 0) - secondaryToDeduct)
                    })
                    .eq('id', stockBefore.id);
                if (updateErr) {
                    console.error('⚠️ Erreur mise à jour stock_by_location:', updateErr.message);
                    if (/row-level security/i.test(updateErr.message || '')) {
                        console.error('❌ RLS bloque la mise à jour de stock_by_location. Vérifiez SUPABASE_SERVICE_ROLE_KEY et les politiques RLS.');
                    }
                }
            } else {
                // Pas de stock_by_location pour ce produit à cet emplacement — 
                // on crée une entrée à 0 (le stock a déjà été "sorti")
                console.warn(`⚠️ Aucun stock_by_location trouvé pour produit ${item.product_id} @ emplacement ${actualFromLocationId}`);
            }

            // Aussi déduire le stock global dans la table products (pour les vues admin et cohérence)
            const { data: productBefore, error: prodErr } = await supabase
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .maybeSingle();

            if (!prodErr && productBefore) {
                const { error: prodUpdateErr } = await supabase.from('products')
                    .update({ stock: Math.max(0, (productBefore.stock || 0) - qtyToDeduct) })
                    .eq('id', item.product_id);
                if (prodUpdateErr) {
                    console.error('⚠️ Erreur mise à jour products.stock:', prodUpdateErr.message);
                    if (/row-level security/i.test(prodUpdateErr.message || '')) {
                        console.error('❌ RLS bloque la mise à jour de products.stock. Vérifiez SUPABASE_SERVICE_ROLE_KEY et les politiques RLS.');
                    }
                }
            }
        }

        createAuditLog(req.user.id, req.user.username, 'SEND_TRANSFER', 'transfer', transferId, { reference, to: to_location_id }, null, actualFromLocationId);

        res.status(201).json({ success: true, transferId, reference });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Étape 2 : Réceptionner un transfert
router.post('/:id/receive', requireAuth, async (req, res) => {
    try {
        const transferId = req.params.id;

        // Vérifier le transfert
        const { data: transfer, error: trfErr } = await supabase
            .from('stock_transfers')
            .select('*')
            .eq('id', transferId)
            .single();

        if (trfErr) throw trfErr;
        
        if (transfer.status !== 'in_transit') {
            return res.status(400).json({ error: 'Ce transfert n\'est pas en transit.' });
        }

        if (req.user.role !== 'admin' && req.user.location_id !== transfer.to_location_id) {
            return res.status(403).json({ error: 'Vous ne pouvez réceptionner que les transferts destinés à votre emplacement.' });
        }

        const { notes, verifiedItems } = req.body || {};
        
        // Obtenir les items originaux
        const { data: items } = await supabase.from('stock_transfer_items').select('*, products(name)').eq('transfer_id', transferId);

        let hasModifications = false;
        
        for (const item of items) {
            // Find verified item if provided
            const verified = verifiedItems ? verifiedItems.find(vi => vi.id === item.id) : null;
            
            const qtyToReceive = verified ? Number(verified.quantity) : Number(item.quantity || 0);
            const emptyQtyToReceive = verified ? Number(verified.empty_packaging_qty) : Number(item.empty_packaging_qty || 0);
            const secondaryEmptyQtyToReceive = verified ? Number(verified.empty_secondary_packaging_qty) : Number(item.empty_secondary_packaging_qty || 0);
            
            const qtyLost = Number(item.quantity || 0) - qtyToReceive;
            const emptyQtyLost = Number(item.empty_packaging_qty || 0) - emptyQtyToReceive;
            const secondaryEmptyQtyLost = Number(item.empty_secondary_packaging_qty || 0) - secondaryEmptyQtyToReceive;

            // Enregistrer la casse / perte si nécessaire
            if (qtyLost > 0 || emptyQtyLost > 0 || secondaryEmptyQtyLost > 0) {
                hasModifications = true;
                await supabase.from('losses_and_damages').insert([{
                    id: uuidv4(),
                    location_id: transfer.to_location_id,
                    product_id: item.product_id,
                    quantity: Math.max(0, qtyLost),
                    empty_packaging_qty: Math.max(0, emptyQtyLost),
                    empty_secondary_packaging_qty: Math.max(0, secondaryEmptyQtyLost),
                    type: 'casse',
                    responsible_user_id: req.user.id,
                    is_reimbursed: false,
                    notes: `Perte en transit du transfert ${transfer.reference}. ${notes || ''}`,
                    created_by: req.user.id
                }]);
                
                // Mettre à jour l'item du transfert pour refléter la réalité reçue
                await supabase.from('stock_transfer_items')
                    .update({
                        quantity: qtyToReceive,
                        empty_packaging_qty: emptyQtyToReceive,
                        empty_secondary_packaging_qty: secondaryEmptyQtyToReceive
                    })
                    .eq('id', item.id);

                // Si c'est une casse d'emballage, l'enregistrer dans l'historique d'emballages
                if (emptyQtyLost > 0 || secondaryEmptyQtyLost > 0) {
                    await supabase.from('packaging_movements').insert([{
                        id: uuidv4(),
                        location_id: transfer.to_location_id,
                        reference: `CASSE-TRF-${transfer.reference}`,
                        type: 'casse',
                        product_id: item.product_id,
                        product_name: item.products?.name,
                        quantity: emptyQtyLost,
                        secondary_quantity: secondaryEmptyQtyLost,
                        notes: `Casse constatée lors de la réception du transfert. ${notes || ''}`,
                        created_by: req.user.id
                    }]);
                }
            }

            // Ajouter au stock du destinataire ce qui a réellement été reçu
            if (qtyToReceive > 0 || emptyQtyToReceive > 0 || secondaryEmptyQtyToReceive > 0) {
                const { data: existingStock } = await supabase
                    .from('stock_by_location')
                    .select('*')
                    .eq('location_id', transfer.to_location_id)
                    .eq('product_id', item.product_id)
                    .maybeSingle();

                if (existingStock) {
                    const { error: sblErr } = await supabase.from('stock_by_location')
                        .update({
                            quantity: parseFloat(existingStock.quantity || 0) + qtyToReceive,
                            empty_packaging_qty: parseFloat(existingStock.empty_packaging_qty || 0) + emptyQtyToReceive,
                            empty_secondary_packaging_qty: parseFloat(existingStock.empty_secondary_packaging_qty || 0) + secondaryEmptyQtyToReceive
                        })
                        .eq('id', existingStock.id);
                    if (sblErr) throw new Error(`Échec mise à jour stock_by_location: ${sblErr.message}`);
                } else {
                    const { error: sblInsErr } = await supabase.from('stock_by_location').insert([{
                        id: uuidv4(),
                        location_id: transfer.to_location_id,
                        product_id: item.product_id,
                        quantity: qtyToReceive,
                        empty_packaging_qty: emptyQtyToReceive,
                        empty_secondary_packaging_qty: secondaryEmptyQtyToReceive
                    }]);
                    if (sblInsErr) throw new Error(`Échec insertion stock_by_location: ${sblInsErr.message}`);
                }

                // Aussi ajouter au stock global dans products (pour cohérence avec la déduction faite à l'envoi)
                const { data: prodData } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .maybeSingle();

                if (prodData) {
                    const { error: prodUpdErr } = await supabase.from('products')
                        .update({ stock: (prodData.stock || 0) + qtyToReceive })
                        .eq('id', item.product_id);
                    if (prodUpdErr) throw new Error(`Échec mise à jour products.stock: ${prodUpdErr.message}`);
                }
            }
        }

        // Marquer comme complété avec notes éventuelles
        await supabase.from('stock_transfers')
            .update({
                status: 'completed',
                received_by: req.user.id,
                received_at: new Date().toISOString(),
                notes: notes ? `${transfer.notes || ''}\n[Vérification]: ${notes}` : transfer.notes
            })
            .eq('id', transferId);

        createAuditLog(req.user.id, req.user.username, 'RECEIVE_TRANSFER', 'transfer', transferId, { reference: transfer.reference }, null, req.user.location_id);

        res.json({ success: true, message: 'Marchandise réceptionnée et stock mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Réception d'un transfert d'emballages vides avec checklist
// POST /stock-transfers/:id/receive-packaging
// Body: { notes, items: [{ id, received_bottles, received_crates, broken_bottles, broken_crates, note }] }
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:id/receive-packaging', requireAuth, async (req, res) => {
    try {
        const transferId = req.params.id;

        // Charger le transfert
        const { data: transfer, error: trfErr } = await supabase
            .from('stock_transfers')
            .select('*, stock_transfer_items(*)')
            .eq('id', transferId)
            .single();

        if (trfErr) throw trfErr;
        if (!transfer) return res.status(404).json({ error: 'Transfert introuvable.' });
        if (transfer.status !== 'in_transit') return res.status(400).json({ error: 'Ce transfert n\'est pas en transit.' });

        // Validation de transfer_type avec tolérance schéma-absent : si la
        // colonne n'a pas encore été ajoutée par la migration, on laisse
        // passer (le mode dégradé logue un avertissement au premier appel).
        const { missing: transferTypeMissing } = unwrapMissingColumn(transfer, 'transfer_type');
        if (!transferTypeMissing && transfer.transfer_type !== 'empty_packaging') {
            return res.status(400).json({ error: 'Ce n\'est pas un transfert d\'emballages vides.' });
        }
        if (transferTypeMissing) {
            console.warn('⚠️ [degraded-mode] stock_transfers.transfer_type absent — validation du type de transfert désactivée.');
        }

        // Autorisation : admin ou utilisateur de l'emplacement destinataire
        if (req.user.role !== 'admin' && req.user.location_id !== transfer.to_location_id) {
            return res.status(403).json({ error: 'Vous ne pouvez réceptionner que les transferts destinés à votre emplacement.' });
        }

        const { notes: globalNotes, items: checklist } = req.body || {};
        const originalItems = transfer.stock_transfer_items || [];

        let totalReceivedBottles = 0;
        let totalReceivedCrates = 0;
        let totalBrokenBottles = 0;
        let totalBrokenCrates = 0;

        for (const originalItem of originalItems) {
            // Trouver les données de checklist pour cet item
            const check = checklist ? checklist.find(c => c.id === originalItem.id) : null;

            const sentBottles = Number(originalItem.empty_packaging_qty) || 0;
            const sentCrates = Number(originalItem.empty_secondary_packaging_qty) || 0;

            // Quantités reçues conformes (défaut = tout reçu sans perte)
            const receivedBottles = check ? Math.min(Number(check.received_bottles) || 0, sentBottles) : sentBottles;
            const receivedCrates = check ? Math.min(Number(check.received_crates) || 0, sentCrates) : sentCrates;

            // Quantités cassées / perdues (calculées ou saisies)
            const brokenBottles = check
                ? Math.min(Number(check.broken_bottles) || 0, sentBottles - receivedBottles)
                : Math.max(0, sentBottles - receivedBottles);
            const brokenCrates = check
                ? Math.min(Number(check.broken_crates) || 0, sentCrates - receivedCrates)
                : Math.max(0, sentCrates - receivedCrates);

            const itemNote = check?.note || '';

            // Récupérer le nom du produit
            const { data: product } = await supabase.from('products').select('id, name').eq('id', originalItem.product_id).maybeSingle();
            const productName = product?.name || originalItem.product_name || 'Produit inconnu';

            // ── 1. Ajouter au stock de la destination les quantités conformes ──
            if (receivedBottles > 0 || receivedCrates > 0) {
                const { data: dstStock, error: dstErr } = await supabase
                    .from('stock_by_location')
                    .select('*')
                    .eq('location_id', transfer.to_location_id)
                    .eq('product_id', originalItem.product_id)
                    .maybeSingle();
                if (dstErr) throw new Error(`Lecture stock destination: ${dstErr.message}`);

                if (dstStock) {
                    const { error: sblUpdErr } = await supabase.from('stock_by_location').update({
                        empty_packaging_qty: (Number(dstStock.empty_packaging_qty) || 0) + receivedBottles,
                        empty_secondary_packaging_qty: (Number(dstStock.empty_secondary_packaging_qty) || 0) + receivedCrates,
                        updated_at: new Date().toISOString()
                    }).eq('id', dstStock.id);
                    if (sblUpdErr) throw new Error(`Mise à jour stock destination: ${sblUpdErr.message}`);
                } else {
                    const { error: sblInsErr } = await supabase.from('stock_by_location').insert([{
                        id: uuidv4(),
                        location_id: transfer.to_location_id,
                        product_id: originalItem.product_id,
                        quantity: 0,
                        empty_packaging_qty: receivedBottles,
                        empty_secondary_packaging_qty: receivedCrates
                    }]);
                    if (sblInsErr) throw new Error(`Insertion stock destination: ${sblInsErr.message}`);
                }

                // Traçabilité réception
                const { error: pmErr } = await supabase.from('packaging_movements').insert({
                    id: uuidv4(),
                    location_id: transfer.to_location_id,
                    product_id: originalItem.product_id,
                    product_name: productName,
                    movement_type: 'empty_transfer',
                    empty_packaging_qty: receivedBottles,
                    empty_secondary_packaging_qty: receivedCrates,
                    source_type: 'transfer',
                    source_id: transferId,
                    notes: `[ARRIVÉE] ${transfer.reference}${itemNote ? ' — ' + itemNote : ''}`,
                    created_at: new Date().toISOString(),
                    created_by: req.user.id
                });
                if (pmErr) throw new Error(`Traçabilité réception: ${pmErr.message}`);
            }

            // ── 2. Enregistrer les pertes / casse ──────────────────────────────
            if (brokenBottles > 0 || brokenCrates > 0) {
                // Tolérance schéma-absent : on retire l'une après l'autre
                // les colonnes ajoutées par la migration si elles n'existent pas.
                let lossPayload = {
                    id: uuidv4(),
                    location_id: transfer.to_location_id,
                    product_id: originalItem.product_id,
                    product_name: productName,
                    quantity: 0,
                    empty_packaging_qty: brokenBottles,
                    empty_secondary_packaging_qty: brokenCrates,
                    type: 'casse_transport',
                    responsible_user_id: req.user.id,
                    is_reimbursed: false,
                    notes: `Casse/perte lors du transfert ${transfer.reference}${itemNote ? ' — ' + itemNote : ''}. ${globalNotes || ''}`,
                    created_by: req.user.id
                };
                const OPTIONAL_LOSS_COLS = [
                    'product_name', 'is_reimbursed',
                    'empty_packaging_qty', 'empty_secondary_packaging_qty',
                    'created_by'
                ];
                for (let attempt = 0; attempt <= OPTIONAL_LOSS_COLS.length; attempt++) {
                    const { error: lossErr } = await supabase.from('losses_and_damages').insert([lossPayload]);
                    if (!lossErr) break;
                    const msg = (lossErr.message || '').toString();
                    if (!/Could not find the .* column .* in the schema cache/i.test(msg)) {
                        throw lossErr;
                    }
                    const missingCol = OPTIONAL_LOSS_COLS.find(c => msg.includes(`'${c}'`));
                    if (!missingCol) throw lossErr;
                    console.warn(`⚠️ [degraded-mode] losses_and_damages.${missingCol} absent — bascule sans cette colonne.`);
                    const slim = { ...lossPayload };
                    delete slim[missingCol];
                    lossPayload = slim;
                }

                // Traçabilité casse dans packaging_movements
                const { error: pmBrkErr } = await supabase.from('packaging_movements').insert({
                    id: uuidv4(),
                    location_id: transfer.to_location_id,
                    product_id: originalItem.product_id,
                    product_name: productName,
                    movement_type: 'breakage',
                    empty_packaging_qty: brokenBottles,
                    empty_secondary_packaging_qty: brokenCrates,
                    source_type: 'transfer',
                    source_id: transferId,
                    notes: `[CASSE TRANSPORT] Transfert ${transfer.reference}${itemNote ? ' — ' + itemNote : ''}`,
                    created_at: new Date().toISOString(),
                    created_by: req.user.id
                });
                if (pmBrkErr) throw new Error(`Traçabilité casse: ${pmBrkErr.message}`);
            }

            // Mettre à jour l'item avec les quantités effectivement reçues.
            // Tolérance schéma-absent : si l'une des colonnes ajoutées par
            // la migration n'existe pas, on l'ôte du payload et on réessaie.
            let itemUpdatePayload = {
                empty_packaging_qty: receivedBottles,
                empty_secondary_packaging_qty: receivedCrates,
                broken_packaging_qty: brokenBottles,
                broken_secondary_packaging_qty: brokenCrates,
                item_notes: itemNote
            };
            const OPTIONAL_ITEM_COLS = ['broken_packaging_qty', 'broken_secondary_packaging_qty', 'item_notes'];
            for (let attempt = 0; attempt <= OPTIONAL_ITEM_COLS.length; attempt++) {
                const { error: updItemErr } = await supabase.from('stock_transfer_items').update(itemUpdatePayload).eq('id', originalItem.id);
                if (!updItemErr) break; // succès
                const msg = (updItemErr.message || '').toString();
                if (!/Could not find the .* column .* in the schema cache/i.test(msg)) {
                    throw updItemErr; // pas une erreur de colonne manquante
                }
                // Trouver la première colonne optionnelle mentionnée dans le message
                const missingCol = OPTIONAL_ITEM_COLS.find(c => msg.includes(`'${c}'`));
                if (!missingCol) {
                    // Colonne non-optionnelle manquante → on ne peut pas dégrader davantage
                    throw updItemErr;
                }
                console.warn(`⚠️ [degraded-mode] stock_transfer_items.${missingCol} absent — bascule sans cette colonne.`);
                const slim = { ...itemUpdatePayload };
                delete slim[missingCol];
                itemUpdatePayload = slim;
            }

            totalReceivedBottles += receivedBottles;
            totalReceivedCrates += receivedCrates;
            totalBrokenBottles += brokenBottles;
            totalBrokenCrates += brokenCrates;
        }

        // ── 3. Marquer le transfert comme réceptionné ──────────────────────────
        await supabase.from('stock_transfers').update({
            status: 'received',
            received_by: req.user.id,
            received_at: new Date().toISOString(),
            notes: `${transfer.notes || ''}${globalNotes ? '\n[Réception]: ' + globalNotes : ''}`
        }).eq('id', transferId);

        createAuditLog(
            req.user.id, req.user.username,
            'RECEIVE_PACKAGING_TRANSFER', 'transfer', transferId,
            {
                reference: transfer.reference,
                received_bottles: totalReceivedBottles,
                received_crates: totalReceivedCrates,
                broken_bottles: totalBrokenBottles,
                broken_crates: totalBrokenCrates,
                notes: globalNotes || null
            },
            null,
            req.user.location_id
        );

        res.json({
            success: true,
            reference: transfer.reference,
            totals: {
                received_bottles: totalReceivedBottles,
                received_crates: totalReceivedCrates,
                broken_bottles: totalBrokenBottles,
                broken_crates: totalBrokenCrates
            }
        });
    } catch (error) {
        console.error('❌ Erreur POST /stock-transfers/:id/receive-packaging:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
