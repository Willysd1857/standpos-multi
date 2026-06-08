/**
 * ============================================
 * SCRIPT D'ACTIVATION - Renderer Process
 * ============================================
 * 
 * Gère l'interface d'activation de la licence
 */

const { ipcRenderer } = require('electron');

// ============================================
// ÉLÉMENTS DOM
// ============================================

const form = document.getElementById('activationForm');
const licenseKeyInput = document.getElementById('licenseKey');
const activateBtn = document.getElementById('activateBtn');
const messageDiv = document.getElementById('message');
const machineIdDisplay = document.getElementById('machineIdDisplay');

// ============================================
// INITIALISATION
// ============================================

// Afficher le Machine ID au chargement
ipcRenderer.invoke('get-machine-id').then(machineId => {
    machineIdDisplay.innerHTML = `<strong>ID Machine:</strong> ${machineId}`;
}).catch(err => {
    machineIdDisplay.innerHTML = `<strong>ID Machine:</strong> Erreur de récupération`;
});

// ============================================
// FONCTIONS D'AFFICHAGE
// ============================================

/**
 * Affiche un message à l'utilisateur
 * @param {string} text - Texte du message
 * @param {string} type - Type: 'error', 'success', 'info'
 */
function showMessage(text, type = 'info') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

/**
 * Cache le message
 */
function hideMessage() {
    messageDiv.style.display = 'none';
}

/**
 * Active/désactive le bouton et le champ
 * @param {boolean} loading - État de chargement
 */
function setLoading(loading) {
    if (loading) {
        activateBtn.disabled = true;
        licenseKeyInput.disabled = true;
        activateBtn.innerHTML = '<span class="spinner"></span> Vérification en cours...';
    } else {
        activateBtn.disabled = false;
        licenseKeyInput.disabled = false;
        activateBtn.textContent = 'Activer la licence';
    }
}

// ============================================
// GESTION DU FORMULAIRE
// ============================================

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const licenseKey = licenseKeyInput.value.trim();

    // Validation basique
    if (!licenseKey) {
        showMessage('Veuillez entrer une clé de licence', 'error');
        return;
    }

    if (licenseKey.length < 10) {
        showMessage('La clé de licence semble trop courte', 'error');
        return;
    }

    // Début de l'activation
    hideMessage();
    setLoading(true);

    try {
        // Envoi de la demande d'activation au processus principal
        const result = await ipcRenderer.invoke('activate-license', licenseKey);

        if (result.success) {
            // ✅ Activation réussie
            showMessage(result.message, 'success');

            // Attendre 1.5 secondes puis fermer la fenêtre
            setTimeout(() => {
                ipcRenderer.send('activation-complete');
            }, 1500);

        } else {
            // ❌ Échec de l'activation
            showMessage(result.message, 'error');
            setLoading(false);
        }

    } catch (error) {
        console.error('Erreur lors de l\'activation:', error);
        showMessage('Erreur inattendue lors de l\'activation', 'error');
        setLoading(false);
    }
});

// ============================================
// FOCUS AUTOMATIQUE
// ============================================

// Focus automatique sur le champ de saisie au chargement
window.addEventListener('load', () => {
    licenseKeyInput.focus();
});

// Permettre l'activation avec Entrée
licenseKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        form.dispatchEvent(new Event('submit'));
    }
});
