/**
 * Script de migration pour synchroniser les compteurs de dettes des clients
 * À exécuter une seule fois pour corriger les données existantes
 */

const supabase = require('./services/supabaseClient');

console.log('🔄 Début de la synchronisation des compteurs de dettes sur Supabase...\n');

async function sync() {
    try {
        // Récupérer tous les clients
        const { data: customers, error: custErr } = await supabase.from('customers').select('customer_id, name');
        if (custErr) throw custErr;

        console.log(`📊 ${(customers || []).length} clients trouvés\n`);

        let updated = 0;
        let blocked = 0;

        for (const customer of customers || []) {
            // Compter les transactions impayées pour ce client
            const { count, error: txErr } = await supabase
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .eq('customer_id', customer.customer_id)
                .eq('status', 'validated')
                .gt('amount_due', 0);
            
            if (txErr) throw txErr;

            const unpaidCount = count || 0;
            const isBlocked = unpaidCount >= 3;

            // Mettre à jour le client
            const { error: updErr } = await supabase
                .from('customers')
                .update({
                    unpaid_count: unpaidCount,
                    is_blocked: isBlocked,
                    updated_at: new Date().toISOString()
                })
                .eq('customer_id', customer.customer_id);

            if (updErr) throw updErr;

            if (unpaidCount > 0) {
                console.log(`✅ ${customer.name} (${customer.customer_id}): ${unpaidCount} dette(s)${isBlocked ? ' 🔒 BLOQUÉ' : ''}`);
                updated++;
                if (isBlocked) blocked++;
            }
        }

        console.log(`\n✅ Synchronisation terminée !`);
        console.log(`   - ${updated} clients avec des dettes`);
        console.log(`   - ${blocked} clients bloqués (≥3 dettes)`);

    } catch (error) {
        console.error('❌ Erreur lors de la synchronisation:', error);
        process.exit(1);
    }
}

sync();
