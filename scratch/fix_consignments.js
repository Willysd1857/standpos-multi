const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: pgs } = await supabase
        .from('purchase_groups')
        .select('id, supplier_id, supplier_name, reference, location_id, items:purchase_group_items(product_id, product_name, quantity, unit_price)')
        .eq('reception_status', 'received');

    for (const pg of pgs) {
        const { data: c } = await supabase
            .from('packaging_consignments')
            .select('id')
            .eq('source_transaction_id', pg.id);

        if (c && c.length === 0 && pg.supplier_id) {
            console.log('Fixing PG:', pg.reference);
            for (const item of pg.items) {
                const { data: p } = await supabase
                    .from('products')
                    .select('empty_packaging_qty, empty_secondary_packaging_qty, bottle_deposit_price, crate_deposit_price')
                    .eq('id', item.product_id)
                    .maybeSingle();

                if (p && (p.empty_packaging_qty > 0 || p.empty_secondary_packaging_qty > 0)) {
                    const b = Math.round(item.quantity * (p.empty_packaging_qty || 0));
                    const cr = Math.round(item.quantity * (p.empty_secondary_packaging_qty || 0));
                    
                    if (b > 0 || cr > 0) {
                        const payload = {
                            id: require('crypto').randomUUID(),
                            entity_type: 'supplier',
                            entity_id: pg.supplier_id,
                            entity_name: pg.supplier_name,
                            product_id: item.product_id,
                            product_name: item.product_name || 'Produit',
                            empty_packaging_qty: b,
                            empty_secondary_packaging_qty: cr,
                            packaging_deposit_value: p.bottle_deposit_price || 0,
                            secondary_packaging_deposit_value: p.crate_deposit_price || 0,
                            status: 'pending',
                            location_id: pg.location_id || 'loc-wh-1',
                            source_transaction_id: pg.id
                        };
                        const { error } = await supabase.from('packaging_consignments').insert(payload);
                        if (error) {
                            console.error('Failed to insert consignment:', error);
                        } else {
                            console.log('Created consignment for', item.product_name, b, cr);
                        }
                    }
                }
            }
        }
    }
    console.log('Done');
}
run();
