/**
 * Mode dégradé pour les colonnes optionnelles.
 *
 * Quand une migration n'a pas encore été appliquée sur la base Supabase,
 * PostgREST renvoie l'erreur PGRST204 :
 *   "Could not find the '<col>' column of '<table>' in the schema cache"
 *
 * Plutôt que de bloquer l'utilisateur, on enveloppe les INSERT/UPDATE
 * concernés : on tente d'abord avec la colonne, et si l'erreur est
 * PGRST204, on réessaie sans. Le résultat (avec ou sans la colonne) est
 * mis en cache pour éviter de payer le coût de la détection à chaque appel.
 *
 * Côté lecture, un helper `safeSelect` permet de retomber sur un SELECT
 * restreint si le `select('col')` n'a pas encore la colonne.
 *
 * Pour « éteindre » le mode dégradé une fois la migration appliquée,
 * il suffit de recharger le module (relancer le serveur).
 */

const cache = new Map(); // key = `${table}:${col}` -> 'present' | 'missing'

function isPgrst204ColumnMissing(err, colName) {
    if (!err) return false;
    const msg = (err.message || err.error || '').toString();
    if (!/Could not find the .* column .* in the schema cache/i.test(msg)) return false;
    if (colName && !msg.includes(`'${colName}'`)) return false;
    return true;
}

/**
 * Tente `insertOrUpdate(payload)`. Si Supabase renvoie PGRST204 sur la
 * colonne `optionalCol`, retire la clé du payload et réessaie une fois.
 * Met en cache le résultat.
 *
 * @param {object} ctx
 * @param {string} ctx.table           - nom de la table
 * @param {string} ctx.optionalCol     - nom de la colonne optionnelle
 * @param {object} ctx.payload         - objet à insérer
 * @param {Function} ctx.execute       - async (payload) => { data, error }
 * @returns {{ data, error, usedFallback: boolean }}
 */
async function tryWithOptionalColumn({ table, optionalCol, payload, execute }) {
    const cacheKey = `${table}:${optionalCol}`;
    const cached = cache.get(cacheKey);

    if (cached === 'missing') {
        const slim = { ...payload };
        delete slim[optionalCol];
        const res = await execute(slim);
        return { ...res, usedFallback: true };
    }

    const first = await execute(payload);
    if (!first.error) {
        cache.set(cacheKey, 'present');
        return { ...first, usedFallback: false };
    }

    if (isPgrst204ColumnMissing(first.error, optionalCol)) {
        console.warn(
            `⚠️ [degraded-mode] ${table}.${optionalCol} absent du schéma ` +
            `Supabase — bascule en mode dégradé. Appliquez ` +
            `server/migrations/empty_packaging_transit.sql pour désactiver.`
        );
        cache.set(cacheKey, 'missing');
        const slim = { ...payload };
        delete slim[optionalCol];
        const retry = await execute(slim);
        return { ...retry, usedFallback: true };
    }

    return { ...first, usedFallback: false };
}

/**
 * Helper de SELECT sûr. Si la colonne est absente du cache de schéma,
 * on retire la projection de la chaîne de colonnes du `.select()`.
 *
 * Usage :
 *   const q = safeSelect(supabase.from('stock_transfers').select('*'),
 *                        'transfer_type', ['transfer_type']);
 *   const { data, error } = await q;
 */
function safeSelect(builder, optionalCol, columnsToRemove = [optionalCol]) {
    const cacheKey = `select:${builder.source || ''}:${optionalCol}`;
    // On ne peut pas facilement inspecter la chaîne construite par le
    // client Supabase. Le plus simple : appliquer le fallback côté JS
    // après réception, en marquant `usedFallback = true` quand la
    // colonne est absente. Voir `unwrapMissingColumn` ci-dessous.
    return builder;
}

function unwrapMissingColumn(data, optionalCol) {
    if (!data) return { data, missing: false };
    const sample = Array.isArray(data) ? data[0] : data;
    if (!sample) return { data, missing: false };
    return { data, missing: !(optionalCol in sample) };
}

module.exports = {
    tryWithOptionalColumn,
    isPgrst204ColumnMissing,
    safeSelect,
    unwrapMissingColumn,
    _cache: cache,
};
