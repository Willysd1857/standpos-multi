const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable');
}

// Create a warning instead of error so the app can start without the key,
// but operations requiring the admin client will fail dynamically.
let supabaseAdmin = null;

if (!supabaseServiceKey) {
    console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing in .env. Admin operations (like creating users) will fail.');
    
    // Create a dummy client that throws on any operation
    const throwMissingKeyError = () => {
        throw new Error('Veuillez ajouter votre SUPABASE_SERVICE_ROLE_KEY dans le fichier .env pour utiliser cette fonctionnalité.');
    };
    
    supabaseAdmin = {
        auth: {
            admin: {
                createUser: throwMissingKeyError,
                deleteUser: throwMissingKeyError,
                updateUserById: throwMissingKeyError
            }
        }
    };
} else {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

module.exports = supabaseAdmin;
