# 🚀 Guide de Démarrage Rapide - Système de Licence StandPOS

## ✅ Installation Terminée

Tous les fichiers ont été créés et configurés. Votre URL Google Apps Script est déjà intégrée.

---

## 📁 Fichiers Créés

| Fichier | Description |
|---------|-------------|
| `electron/licenseService.js` | Service de gestion des licences |
| `electron/activation.html` | Interface d'activation |
| `electron/activation.js` | Logique d'activation |
| `electron/main.js` | ✏️ Modifié pour intégrer le système |

---

## 🎯 Comment Tester

### 1️⃣ Lancer l'Application

```bash
npm run electron:dev
```

### 2️⃣ Fenêtre d'Activation

La fenêtre d'activation s'ouvrira automatiquement au premier lancement.

### 3️⃣ Entrer une Clé de Licence

Utilisez une clé valide de votre Google Sheet (colonne LICENSE_KEY avec STATUS vide ou correspondant au même MACHINE_ID).

### 4️⃣ Tester le Mode Offline

1. Activez la licence
2. Fermez l'app
3. Relancez → L'app s'ouvre directement sans demander la licence

---

## 🔍 Où Trouver les Informations

### Machine ID

Affiché dans la fenêtre d'activation en bas de l'écran.

### Fichier de Licence

```
%APPDATA%\StandPOS\license.json
```

Pour y accéder rapidement :
1. Appuyez sur `Win + R`
2. Tapez : `%APPDATA%\StandPOS`
3. Entrée

### Logs de l'Application

```
%APPDATA%\StandPOS\logs\app.log
```

---

## 🛠️ Configuration Google Apps Script

Votre URL est déjà configurée dans `licenseService.js` ligne 23 :

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxHITx3-jsJHbKPj7VuFXnIDpl9mtgLhefAWiJRKfCSQKCe7VZSYi1ZEZ6HUq_hpKIasQ/exec';
```

### Format de Réponse Attendu

Votre Google Apps Script doit retourner :

```javascript
// Licence valide
{ "status": "VALID" }

// Licence invalide
{ "status": "INVALID" }

// Déjà utilisée sur un autre PC
{ "status": "USED_ON_OTHER_PC" }
```

---

## ⚠️ Résolution de Problèmes

### Erreur : "Impossible de contacter le serveur"

- ✅ Vérifiez votre connexion Internet
- ✅ Vérifiez que le Web App est déployé
- ✅ Vérifiez l'URL dans `licenseService.js`

### Erreur : "Clé de licence invalide"

- ✅ Vérifiez que la clé existe dans votre Google Sheet
- ✅ Vérifiez que la colonne STATUS est vide ou correspond au même MACHINE_ID

### L'application ne démarre pas

- ✅ Consultez les logs : `%APPDATA%\StandPOS\logs\app.log`
- ✅ Ouvrez la console DevTools (F12 en mode dev)

---

## 🔄 Réinitialiser la Licence

Pour tester à nouveau l'activation :

1. Fermez l'application
2. Supprimez le fichier : `%APPDATA%\StandPOS\license.json`
3. Relancez l'application

---

## 📊 Scénarios de Test

### ✅ Test 1 : Première Activation

1. Lancez l'app
2. Entrez une clé valide
3. ✅ Message de succès + ouverture de l'app

### ✅ Test 2 : Clé Invalide

1. Réinitialisez la licence
2. Entrez "ABC123"
3. ✅ Message d'erreur "Clé de licence invalide"

### ✅ Test 3 : Licence Déjà Utilisée

1. Activez sur PC1
2. Notez le Machine ID
3. Essayez d'activer avec la même clé sur PC2
4. ✅ Message "Cette licence est déjà utilisée sur un autre ordinateur"

### ✅ Test 4 : Mode Offline

1. Activez la licence
2. Fermez l'app
3. Déconnectez Internet
4. Relancez l'app
5. ✅ L'app s'ouvre sans demander la licence

---

## 🎨 Personnalisation

### Modifier le Design de la Fenêtre d'Activation

Éditez `electron/activation.html` (CSS intégré dans la balise `<style>`).

### Modifier les Messages

Éditez `electron/licenseService.js` (fonction `activateLicense`).

### Modifier la Taille de la Fenêtre

Éditez `electron/main.js` (fonction `createActivationWindow`) :

```javascript
activationWindow = new BrowserWindow({
    width: 500,  // ← Modifier ici
    height: 600, // ← Modifier ici
    // ...
});
```

---

## 🚀 Déploiement en Production

### 1. Construire l'Application

```bash
npm run electron:build
```

### 2. Installer sur un PC de Test

Le fichier `.exe` sera dans `dist_electron/`.

### 3. Tester le Cycle Complet

- Activation
- Utilisation offline
- Tentative sur autre PC

---

## 📞 Besoin d'Aide ?

Consultez le fichier `walkthrough.md` pour une documentation complète avec :

- Diagrammes de flux
- Détails techniques
- Sécurité
- Améliorations possibles

---

**🎉 Le système est prêt à être testé !**
