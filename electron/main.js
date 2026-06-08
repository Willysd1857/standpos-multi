const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

// Import du service de gestion des licences
const licenseService = require('./licenseService');


// Set up logging
const userDataPath = app.getPath('userData');
const logDir = path.join(userDataPath, 'logs');
const logger = new Logger(logDir);

logger.info('=== StandPOS Application Starting ===');
logger.info(`User Data Path: ${userDataPath}`);
logger.info(`Is Packaged: ${app.isPackaged}`);
logger.info(`App Path: ${app.getAppPath()}`);

// Clean old logs
logger.cleanOldLogs();

// Set up database path to be in the user data directory (writable)
const dbPath = path.join(userDataPath, 'standpos.db');

// Migration: Rename old moonlight.db to standpos.db if it exists
const oldDbPath = path.join(userDataPath, 'moonlight.db');
if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    try {
        fs.renameSync(oldDbPath, dbPath);
        logger.info('Migrated database from moonlight.db to standpos.db');
    } catch (error) {
        logger.error('Failed to migrate database', error);
    }
}

process.env.DB_PATH = dbPath;
logger.info(`Database Path: ${dbPath}`);

const uploadPath = path.join(userDataPath, 'uploads');
process.env.UPLOAD_PATH = uploadPath;
logger.info(`Upload Path: ${uploadPath}`);

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
    logger.info('Created uploads directory');
}

// Ensure server knows it's running in electron
process.env.IS_ELECTRON = 'true';

// Import the server with proper error handling
let server;
try {
    logger.info('Loading server module...');

    // In packaged app, the server files are in the asar archive
    // We need to use the correct path
    const serverPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'server', 'server.js')
        : path.join(__dirname, '..', 'server', 'server.js');

    logger.info(`Server Path: ${serverPath}`);

    // Check if server file exists (for debugging)
    if (!app.isPackaged) {
        const exists = fs.existsSync(serverPath);
        logger.info(`Server file exists: ${exists}`);
    }

    server = require(serverPath);
    logger.info('Server module loaded successfully');
} catch (error) {
    logger.error('CRITICAL: Failed to load server module', error);

    // Show error dialog to user
    dialog.showErrorBox(
        'Erreur Critique',
        `Impossible de charger le serveur.\n\nDétails: ${error.message}\n\nConsultez les logs: ${path.join(logDir, 'app.log')}`
    );

    app.quit();
    process.exit(1);
}

let mainWindow;

/**
 * Wait for the Express server to be ready by polling the health endpoint
 * This prevents race conditions where the frontend tries to load before backend is ready
 */
async function waitForServer(port, maxAttempts = 30) {
    logger.info(`Waiting for server on port ${port}...`);

    for (let i = 0; i < maxAttempts; i++) {
        try {
            await new Promise((resolve, reject) => {
                const http = require('http');
                const req = http.get(`http://localhost:${port}/api/health`, (res) => {
                    if (res.statusCode === 200) {
                        resolve();
                    } else {
                        reject(new Error(`Status Code: ${res.statusCode}`));
                    }
                });
                req.on('error', reject);
                req.end();
            });
            logger.info(`Server ready on port ${port} after ${i + 1} attempts`);
            return true;
        } catch (e) {
            // Server not ready yet, will retry
            logger.debug(`Attempt ${i + 1}/${maxAttempts}: Server not ready yet - ${e.message}`);
        }
        // Wait 200ms between attempts (max 6 seconds total)
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.error('Server failed to start within timeout period');
    throw new Error('Server failed to start within timeout period');
}

async function createMainWindow() {
    logger.info('Creating main window...');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../public/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const PORT = 3002;

    // Wait for server to be ready before loading the app
    try {
        await waitForServer(PORT);

        // In development mode, load from Vite's dev server (5173)
        // In production, load from the backend server (3002) which serves static files
        const url = !app.isPackaged ? 'http://localhost:5173' : `http://localhost:${PORT}`;
        logger.info(`Loading application from: ${url}`);

        await mainWindow.loadURL(url);
        logger.info('Application loaded successfully');

        // Open DevTools in development mode
        if (!app.isPackaged) {
            mainWindow.webContents.openDevTools();
        }
    } catch (error) {
        logger.error('Failed to start application', error);

        // Show detailed error dialog to user
        dialog.showErrorBox(
            'Erreur de démarrage',
            `Le serveur n'a pas pu démarrer.\n\nDétails: ${error.message}\n\nConsultez les logs dans:\n${path.join(logDir, 'app.log')}\n\nVeuillez réessayer ou contacter le support.`
        );

        app.quit();
    }

    mainWindow.on('closed', function () {
        logger.info('Main window closed');
        mainWindow = null;
    });
}

app.on('ready', async () => {
    logger.info('App ready event fired');

    // Vérification de la licence locale
    const isLicenseValid = licenseService.checkLocalLicense();

    if (isLicenseValid) {
        logger.info('✅ Licence locale valide - Ouverture de l\'application');
        createMainWindow();
    } else {
        logger.info('❌ Aucune licence valide - Ouverture de la fenêtre d\'activation');
        createActivationWindow();
    }
});

/**
 * Crée la fenêtre d'activation de la licence
 */
let activationWindow = null;

function createActivationWindow() {
    logger.info('Création de la fenêtre d\'activation...');

    activationWindow = new BrowserWindow({
        width: 500,
        height: 600,
        resizable: false,
        icon: path.join(__dirname, '../public/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Charger le fichier HTML d'activation
    const activationPath = path.join(__dirname, 'activation.html');
    activationWindow.loadFile(activationPath);

    // Ouvrir DevTools en développement
    if (!app.isPackaged) {
        activationWindow.webContents.openDevTools();
    }

    activationWindow.on('closed', () => {
        logger.info('Fenêtre d\'activation fermée');
        activationWindow = null;
    });
}

// ============================================
// GESTION DES ÉVÉNEMENTS IPC (Communication avec la fenêtre d'activation)
// ============================================

/**
 * Récupère le Machine ID
 */
ipcMain.handle('get-machine-id', async () => {
    try {
        return licenseService.getMachineId();
    } catch (error) {
        logger.error('Erreur lors de la récupération du Machine ID', error);
        return 'Erreur';
    }
});

/**
 * Active la licence
 */
ipcMain.handle('activate-license', async (event, licenseKey) => {
    logger.info('Tentative d\'activation de la licence...');

    try {
        const result = await licenseService.activateLicense(licenseKey);
        logger.info('Résultat de l\'activation:', result);
        return result;
    } catch (error) {
        logger.error('Erreur lors de l\'activation', error);
        return {
            success: false,
            message: 'Erreur inattendue lors de l\'activation'
        };
    }
});

/**
 * Activation terminée avec succès - fermer la fenêtre d'activation et ouvrir l'app
 */
ipcMain.on('activation-complete', () => {
    logger.info('Activation terminée avec succès');

    if (activationWindow) {
        activationWindow.close();
        activationWindow = null;
    }

    // Créer la fenêtre principale
    createMainWindow();
});

app.on('window-all-closed', function () {
    logger.info('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    logger.info('App activated');
    if (mainWindow === null) {
        const isLicenseValid = licenseService.checkLocalLicense();
        if (isLicenseValid) {
            createMainWindow();
        } else {
            createActivationWindow();
        }
    }
});

app.on('quit', () => {
    logger.info('=== StandPOS Application Shutting Down ===');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', new Error(reason));
});
