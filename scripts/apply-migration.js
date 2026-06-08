// scripts/apply-migration.js
// Apply a SQL migration file using the Supabase service role
// Usage: node scripts/apply-migration.js server/migration_xxx.sql
const fs = require('fs');
const path = require('path');
const https = require('https');

// Direct PostgreSQL connection via Supabase's pg connection string
// This requires the SUPABASE_DB_URL env var or a parsed version

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.error('Usage: node scripts/apply-migration.js <sql-file>');
    process.exit(1);
}

const sql = fs.readFileSync(path.resolve(sqlFile), 'utf8');
console.log(`Loaded SQL file: ${sqlFile} (${sql.length} chars)`);

// Try to use the Supabase connection string
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ SUPABASE_DB_URL is not set in .env');
    console.log('You can find the connection string in Supabase Dashboard → Project Settings → Database → Connection string (Direct).');
    process.exit(1);
}

const { Client } = require('pg');
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

(async () => {
    try {
        await client.connect();
        console.log('✅ Connected to database');
        await client.query(sql);
        console.log('✅ Migration applied successfully');
        await client.end();
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
})();
