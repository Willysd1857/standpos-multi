const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const supabase = require('./services/supabaseClient');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const transactionsRouter = require('./routes/transactions');
const stockRouter = require('./routes/stock');
const settingsRouter = require('./routes/settings');
const expensesRouter = require('./routes/expenses');
const purchasesRouter = require('./routes/purchases');
const purchaseGroupsRouter = require('./routes/purchaseGroups');
const ingredientUsagesRouter = require('./routes/ingredientUsages');
const customersRouter = require('./routes/customers');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const auditRouter = require('./routes/audit');
const locationsRouter = require('./routes/locations');
const suppliersRouter = require('./routes/suppliers');
const stockTransfersRouter = require('./routes/stockTransfers');
const lossesRouter = require('./routes/losses');
const packagingRouter = require('./routes/packaging');
const biReportsRouter = require('./routes/bi_reports');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware - CORS configured for Netlify frontend
const corsOptions = {
    origin: process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
        : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(process.env.UPLOAD_PATH || path.join(__dirname, 'uploads')));

// Serve static files from the React build directory (Client)
// In packaged Electron app, dist folder is extracted to a specific location
const distPath = process.env.IS_ELECTRON === 'true' && process.env.DIST_PATH
    ? process.env.DIST_PATH
    : path.join(__dirname, '../dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log('Serving static files from:', distPath);
} else {
    console.warn('WARNING: dist directory not found at:', distPath);
}

// Configure Cloudinary
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'standpos_uploads', // Folder in Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif']
    }
});

const upload = multer({ storage: storage });

// Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return the secure URL from Cloudinary
    res.json({ file_url: req.file.path });
});

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.post('/api/settings/wipe-data', async (req, res) => {
    console.log('>>> WIPING DATA FROM ROOT HANDLER USING SUPABASE');
    const { getUserFromRequest, createAuditLog } = require('./middleware/auditLogger');
    try {
        const user = getUserFromRequest(req);
        if (user.role !== 'admin') return res.status(403).json({ error: 'Seul l\'administrateur peut effectuer cette action.' });

        const tables = ['transactions', 'payments', 'stock_movements', 'expenses', 'purchase_groups', 'purchase_group_items', 'purchases', 'ingredient_movements', 'ingredient_usage_groups', 'audit_logs', 'stock_transfer_items', 'stock_transfers', 'supplier_transactions', 'packaging_movements', 'packaging_consignments'];
        
        // Delete all rows in parallel/sequentially for each table in Supabase
        for (const table of tables) {
            const { error } = await supabase.from(table).delete().neq('id', 'null');
            if (error) {
                console.warn(`Could not clear table ${table}:`, error.message);
            }
        }

        // Reset customer debt counters
        await supabase
            .from('customers')
            .update({ unpaid_count: 0, is_blocked: false })
            .neq('id', 'null');
            
        // Reset supplier debt counters
        await supabase
            .from('suppliers')
            .update({ total_debt: 0 })
            .neq('id', 'null');

        // Reset product packaging stock
        await supabase
            .from('products')
            .update({ empty_packaging_qty: 0, empty_secondary_packaging_qty: 0 })
            .neq('id', 'null');

        // Create audit log
        createAuditLog(user.id, user.username, 'WIPE_ALL_DATA', 'system', 'all', { message: "Réinitialisation par l'administrateur." }, null, user.location_id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use('/api/products/import', require('./routes/importProducts'));
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/purchase-groups', purchaseGroupsRouter);
app.use('/api/ingredient-usages', ingredientUsagesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/export', require('./routes/export'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/reports', reportsRouter);
app.use('/api/debug', require('./routes/debug'));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/stock-transfers', stockTransfersRouter);
app.use('/api/losses', lossesRouter);
app.use('/api/packaging', packagingRouter);
app.use('/api/bi-reports', biReportsRouter);

// Health check - MUST be before catch-all route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    // Check if it's an API request that wasn't handled
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(500).send('Application files not found');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('🔥 Server Error:', err);

    // Log error to a file for easier debugging
    const errorLog = `${new Date().toISOString()} - ${req.method} ${req.url}\n${err.stack}\n\n`;
    fs.appendFileSync(path.join(__dirname, 'server_errors.log'), errorLog);

    res.status(500).json({ error: err.message || 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`✓ Server is running on port ${PORT}`);
    console.log(`✓ Static files served from: ${distPath}`);

    // Vérification post-démarrage : la colonne transfer_type doit exister
    // (cf. server/migrations/empty_packaging_transit.sql). Sans elle, tout
    // transfert d'emballages échoue avec une erreur de cache de schéma
    // PostgREST "Could not find the 'transfer_type' column".
    supabase
        .from('stock_transfers')
        .select('transfer_type')
        .limit(1)
        .then(({ error }) => {
            if (error && /column.*transfer_type/i.test(error.message || '')) {
                console.error('');
                console.error('❌ ============================================================');
                console.error('❌ MIGRATION MANQUANTE : stock_transfers.transfer_type n\'existe pas');
                console.error('❌ Le transfert d\'emballages vides va échouer.');
                console.error('❌ Exécutez : node server/apply_migration_empty_packaging_transit.js');
                console.error('❌ ou collez server/migrations/empty_packaging_transit.sql dans');
                console.error('❌ Supabase Dashboard > SQL Editor.');
                console.error('❌ ============================================================');
                console.error('');
            }
        });
});

module.exports = app;
