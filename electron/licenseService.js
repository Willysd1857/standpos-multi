/**
 * ============================================
 * SERVICE DE GESTION DES LICENCES - StandPOS
 * ============================================
 * 
 * Ce module gère l'activation et la vérification des licences.
 * Il permet :
 * - Vérification en ligne via Google Apps Script
 * - Sauvegarde locale de la licence
 * - Validation offline après activation
 * - Liaison 1 licence = 1 ordinateur
 */

const { machineIdSync } = require('node-machine-id');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { app } = require('electron');

// ============================================
// UTILITAIRE HTTP (remplacement de fetch)
// ============================================

/**
 * Effectue une requête HTTP/HTTPS POST compatible avec toutes versions de Node.js.
 * Suit correctement les redirections de Google Apps Script en re-POST-ant à la nouvelle URL.
 */
function httpPost(url, body, _redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (_redirectCount > 5) {
            return reject(new Error('Trop de redirections'));
        }

        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? https : http;

        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                'User-Agent': 'StandPOS-LicenseService/1.0'
            }
        };

        const req = lib.request(options, (res) => {
            // Suivre les redirections (Google Apps Script renvoie 302 vers une URL GET avec le résultat)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); // Consommer la réponse pour libérer la connexion

                const redirectUrl = res.headers.location;
                const redirectParsed = new URL(redirectUrl);
                const redirectLib = redirectParsed.protocol === 'https:' ? https : http;

                // La redirection d'un POST (vers script.googleusercontent.com) DOIT être faite en GET
                const redirectOptions = {
                    hostname: redirectParsed.hostname,
                    port: redirectParsed.port || (redirectParsed.protocol === 'https:' ? 443 : 80),
                    path: redirectParsed.pathname + redirectParsed.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'StandPOS-LicenseService/1.0'
                    }
                };

                const redirectReq = redirectLib.request(redirectOptions, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', (chunk) => { data += chunk; });
                    redirectRes.on('end', () => {
                        resolve({
                            ok: redirectRes.statusCode >= 200 && redirectRes.statusCode < 300,
                            status: redirectRes.statusCode,
                            text: () => Promise.resolve(data)
                        });
                    });
                });

                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => Promise.resolve(data)
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Timeout de connexion (15s)'));
        });
        req.write(bodyStr);
        req.end();
    });
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * URL de votre Google Apps Script Web App
 * ⚠️ IMPORTANT : Collez ici l'URL de votre déploiement Apps Script
 */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxHITx3-jsJHbKPj7VuFXnIDpl9mtgLhefAWiJRKfCSQKCe7VZSYi1ZEZ6HUq_hpKIasQ/exec';

// Chemin du fichier de licence locale sera récupéré dynamiquement
function getLicenseFilePath() {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'license.json');
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Récupère l'identifiant unique de la machine
 * Cet ID est stable et unique pour chaque ordinateur
 * 
 * @returns {string} Machine ID unique
 */
function getMachineId() {
    try {
        return machineIdSync();
    } catch (error) {
        console.error('Erreur lors de la récupération du Machine ID:', error);
        throw new Error('Impossible d\'identifier cet ordinateur');
    }
}

// ============================================
// VÉRIFICATION EN LIGNE
// ============================================

/**
 * Vérifie la licence en ligne via Google Apps Script
 * 
 * @param {string} licenseKey - Clé de licence à vérifier
 * @returns {Promise<Object>} Résultat de la vérification
 * 
 * Réponses possibles :
 * - { status: "VALID" } : Licence valide et activée
 * - { status: "INVALID" } : Clé de licence invalide
 * - { status: "USED_ON_OTHER_PC" } : Licence déjà utilisée sur un autre PC
 */
async function verifyLicenseOnline(licenseKey) {
    try {
        const machineId = getMachineId();

        console.log('🔍 Vérification de la licence en ligne...');

        // Envoi POST avec JSON — votre Apps Script utilise doPost(e) + e.postData.contents
        const response = await httpPost(APPS_SCRIPT_URL, {
            licenseKey: licenseKey.trim(),
            machineId: machineId
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const text = await response.text();
        console.log('✅ Réponse brute du serveur:', text);

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Erreur lors du parsing JSON:', text);
            return { status: 'ERROR', message: 'Réponse serveur invalide' };
        }

    } catch (error) {
        console.error('❌ Erreur lors de la vérification en ligne:', error);

        return {
            status: 'ERROR',
            message: `Erreur de connexion : ${error.message}`
        };
    }
}

// ============================================
// GESTION LOCALE DE LA LICENCE
// ============================================

/**
 * Sauvegarde la licence localement après activation réussie
 * 
 * @param {string} licenseKey - Clé de licence à sauvegarder
 * @param {string} machineId - ID de la machine
 */
function saveLicenseLocally(licenseKey, machineId) {
    try {
        const licenseData = {
            licenseKey: licenseKey,
            machineId: machineId,
            activatedAt: new Date().toISOString(),
            version: '1.0'
        };

        // Encodage simple pour éviter modification facile
        const encoded = Buffer.from(JSON.stringify(licenseData)).toString('base64');

        fs.writeFileSync(getLicenseFilePath(), JSON.stringify({ data: encoded }), 'utf8');

        console.log('💾 Licence sauvegardée localement');
        return true;

    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de la licence:', error);
        return false;
    }
}

/**
 * Charge la licence sauvegardée localement
 * 
 * @returns {Object|null} Données de la licence ou null si inexistante/invalide
 */
function loadLocalLicense() {
    try {
        if (!fs.existsSync(getLicenseFilePath())) {
            console.log('ℹ️ Aucune licence locale trouvée');
            return null;
        }

        const fileContent = fs.readFileSync(getLicenseFilePath(), 'utf8');
        const parsed = JSON.parse(fileContent);

        // Décodage
        const decoded = Buffer.from(parsed.data, 'base64').toString('utf8');
        const licenseData = JSON.parse(decoded);

        console.log('📂 Licence locale chargée');
        return licenseData;

    } catch (error) {
        console.error('❌ Erreur lors du chargement de la licence locale:', error);
        return null;
    }
}

/**
 * Vérifie la validité de la licence locale
 * 
 * @returns {boolean} true si la licence locale est valide
 */
function checkLocalLicense() {
    try {
        const localLicense = loadLocalLicense();

        if (!localLicense) {
            console.log('❌ Aucune licence locale');
            return false;
        }

        const currentMachineId = getMachineId();

        // Vérification que la licence correspond bien à cette machine
        if (localLicense.machineId !== currentMachineId) {
            console.log('❌ La licence ne correspond pas à cet ordinateur');
            return false;
        }

        console.log('✅ Licence locale valide');
        return true;

    } catch (error) {
        console.error('❌ Erreur lors de la vérification locale:', error);
        return false;
    }
}

/**
 * Supprime la licence locale (pour réinitialisation)
 */
function deleteLicense() {
    try {
        if (fs.existsSync(getLicenseFilePath())) {
            fs.unlinkSync(getLicenseFilePath());
            console.log('🗑️ Licence locale supprimée');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de la licence:', error);
    }
}

// ============================================
// PROCESSUS D'ACTIVATION COMPLET
// ============================================

/**
 * Active la licence : vérifie en ligne puis sauvegarde localement
 * 
 * @param {string} licenseKey - Clé de licence à activer
 * @returns {Promise<Object>} Résultat de l'activation
 */
async function activateLicense(licenseKey) {
    console.log('🚀 Début du processus d\'activation...');

    // 1. Vérification en ligne
    const onlineResult = await verifyLicenseOnline(licenseKey);

    // 2. Si la licence est valide, on la sauvegarde localement
    if (onlineResult.status === 'VALID') {
        const machineId = getMachineId();
        const saved = saveLicenseLocally(licenseKey, machineId);

        if (saved) {
            return {
                success: true,
                message: 'Licence activée avec succès !'
            };
        } else {
            return {
                success: false,
                message: 'Licence valide mais erreur de sauvegarde locale'
            };
        }
    }

    // 3. Gestion des erreurs
    if (onlineResult.status === 'INVALID') {
        return {
            success: false,
            message: 'Clé de licence invalide'
        };
    }

    if (onlineResult.status === 'USED_ON_OTHER_PC') {
        return {
            success: false,
            message: 'Cette licence est déjà utilisée sur un autre ordinateur'
        };
    }

    if (onlineResult.status === 'ERROR') {
        return {
            success: false,
            message: onlineResult.message || 'Erreur de connexion au serveur'
        };
    }

    return {
        success: false,
        message: 'Erreur inconnue lors de l\'activation'
    };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    getMachineId,
    verifyLicenseOnline,
    checkLocalLicense,
    activateLicense,
    deleteLicense,
    loadLocalLicense
};
