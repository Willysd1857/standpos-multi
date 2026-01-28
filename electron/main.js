const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Set up database path to be in the user data directory (writable)
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'moonlight.db');
process.env.DB_PATH = dbPath;

const uploadPath = path.join(userDataPath, 'uploads');
process.env.UPLOAD_PATH = uploadPath;

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// Ensure server knows it's running in electron if needed
process.env.IS_ELECTRON = 'true';

// Import the server (this will start it)
// We need to handle the case where server file paths might be different in production
// For development, it's ../server/server.js
// For production (asar), we might need to copy server files or rely on bundling
// Simplest approach for now: Require the server code.
// Note: server.js connects to DB immediately on require, which is why we set ENV above first.
const server = require('../server/server.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../public/icon.png'), // Adjust path as needed
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Load the app
    // In development: Load from localhost Vite server
    // In production: Load from the local static build being served by Express (on localhost:3001)

    // Since we started the express server via require('../server/server.js'), it is listenting on PORT 3001
    const PORT = 3001;

    // We add a small delay or retry mechanic to ensure server is ready, though usually it's fast.
    setTimeout(() => {
        mainWindow.loadURL(`http://localhost:${PORT}`);
    }, 1000);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
