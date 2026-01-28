const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');
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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(process.env.UPLOAD_PATH || path.join(__dirname, 'uploads')));

// Serve static files from the React build directory (Client)
app.use(express.static(path.join(__dirname, '../dist')));

// Configure Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return the URL to access the file
    // Use relative path for portability across different environments
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ file_url: fileUrl });
});

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
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

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    // Check if it's an API request that wasn't handled
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start server
db.initialize()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;
