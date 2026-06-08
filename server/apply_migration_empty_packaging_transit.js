// Applique la migration empty_packaging_transit.sql à votre base Supabase.
// Usage : node apply_migration_empty_packaging_transit.js
//
// Deux modes :
//   1) Via la Management API (recommandé) : nécessite SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN
//      dans .env, ou via `supabase login` préalable.
//   2) Fallback : affiche le SQL prêt à coller dans le SQL Editor du dashboard.

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const migrationFile = path.join(__dirname, 'migrations', 'empty_packaging_transit.sql');
const sql = fs.readFileSync(migrationFile, 'utf8');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

async function applyViaManagementApi() {
  if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
    throw new Error('SUPABASE_PROJECT_REF ou SUPABASE_ACCESS_TOKEN manquant');
  }
  const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function applyViaPg() {
  // Fallback si l'utilisateur a `pg` d'installé et un DATABASE_URL direct
  let pg;
  try { pg = require('pg'); } catch { throw new Error('pg non installé'); }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL || SUPABASE_URL.replace('https://', 'postgresql://postgres:') });
  await client.connect();
  try { await client.query(sql); } finally { await client.end(); }
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' MIGRATION 2026-06-06 — empty_packaging_transit');
  console.log('═══════════════════════════════════════════════════════════════════');

  // Tentative 1 : Management API
  if (SUPABASE_PROJECT_REF && SUPABASE_ACCESS_TOKEN) {
    try {
      console.log('▶ Application via Supabase Management API…');
      await applyViaManagementApi();
      console.log('✅ Migration appliquée. Le cache de schéma PostgREST va se rafraîchir automatiquement (≤ 1 min).');
      return;
    } catch (e) {
      console.warn('⚠️ Management API échec :', e.message);
    }
  }

  // Tentative 2 : pg direct
  if (process.env.DATABASE_URL) {
    try {
      console.log('▶ Application via pg / DATABASE_URL…');
      await applyViaPg();
      console.log('✅ Migration appliquée.');
      return;
    } catch (e) {
      console.warn('⚠️ pg échec :', e.message);
    }
  }

  // Fallback : print
  console.log('');
  console.log('Application automatique indisponible. Copiez-collez le SQL ci-dessous');
  console.log('dans Supabase Dashboard > SQL Editor > New query :');
  console.log('');
  console.log('─'.repeat(70));
  console.log(sql);
  console.log('─'.repeat(70));
  console.log('');
  console.log('Fichier source :', migrationFile);
})();
