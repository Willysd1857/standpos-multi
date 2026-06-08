const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const { data: txs, error: txsErr } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(1);
        if (txs && txs.length > 0) {
            console.log('Latest transaction ID:', txs[0].id);
            console.log('Created at:', txs[0].created_at);
            console.log('Items:', txs[0].items);
        } else {
            console.log('No transactions found.');
        }

        const { data: mvs, error: mvsErr } = await supabase.from('packaging_movements').select('*').order('created_at', { ascending: false }).limit(2);
        console.log('Latest packaging_movements:', mvs);

        const { data: errs, error: eErr } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(2);
        console.log('Latest audit logs:', errs?.map(e => e.action));

    } catch (e) {
        console.error(e);
    }
}

run();
