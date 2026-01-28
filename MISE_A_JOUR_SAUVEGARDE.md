# 📦 Mise à Jour : Système de Sauvegarde/Restauration

## ✅ Modifications Effectuées

### 1. Amélioration du Code de Sauvegarde (`server/routes/backup.js`)

**Sauvegarde** :
- ✅ Logs détaillés montrant le nombre de fichiers à sauvegarder
- ✅ Vérification que le dossier uploads existe
- ✅ Affichage des noms de fichiers
- ✅ Gestion d'erreur améliorée

**Restauration** :
- ✅ Extraction fichier par fichier pour plus de contrôle
- ✅ Création automatique du dossier uploads s'il n'existe pas
- ✅ Nettoyage du dossier avant extraction
- ✅ Logs détaillés de chaque fichier extrait
- ✅ Vérification post-extraction

### 2. Nouveaux Scripts de Diagnostic

**`test_backup.js`** :
- Vérifie le contenu d'un fichier ZIP de sauvegarde
- Affiche la liste des fichiers et leur taille
- Confirme que la base de données ET les images sont présentes

**`check_storage_locations.js`** :
- Affiche où sont stockées les données (dev vs Electron)
- Compte le nombre de fichiers dans chaque emplacement
- Donne les chemins exacts pour copie manuelle

**`copy_images_to_electron.ps1`** :
- Script PowerShell pour copier automatiquement les images
- Du dossier dev vers le dossier Electron
- Solution de secours si la restauration automatique échoue

### 3. Documentation

**`SOLUTION_IMAGES_MANQUANTES.md`** :
- Guide complet étape par étape
- Solution automatique (recommandée)
- Solution manuelle (secours)
- Checklist de vérification

**`GUIDE_DEPANNAGE_SAUVEGARDE.md`** :
- Guide technique détaillé
- Diagnostic selon les symptômes
- Logs à surveiller
- Instructions spécifiques pour Electron

---

## 🎯 Comment Utiliser

### Pour Créer une Sauvegarde

1. Ouvrez l'application
2. Allez dans **Paramètres** > **Gestion des Données**
3. Cliquez sur **Sauvegarder**
4. Un fichier ZIP sera téléchargé

### Pour Vérifier une Sauvegarde

```bash
node test_backup.js "Downloads\moonlight_backup_2026-01-26.zip"
```

Vous verrez :
- ✅ Si la base de données est présente
- ✅ Combien d'images sont incluses
- 📋 La liste complète des fichiers

### Pour Restaurer sur un Autre PC

**Méthode Recommandée** (avec logs) :

1. Installez l'application Moonlight sur le nouveau PC
2. Lancez en mode console pour voir les logs :
   ```bash
   npm run server
   ```
3. Ouvrez `http://localhost:3001` dans le navigateur
4. Allez dans Paramètres > Restaurer
5. Sélectionnez votre fichier ZIP
6. **Regardez les logs** - vous devriez voir :
   ```
   Fichiers uploads trouvés: 12
   12 fichiers extraits dans uploads.
   ```
7. Redémarrez l'application

**Méthode Alternative** (application .exe) :

1. Installez et lancez l'application .exe
2. Restaurez la sauvegarde normalement
3. Si les images ne s'affichent pas :
   - Extrayez le ZIP manuellement
   - Ouvrez `%APPDATA%\moonlight-bar`
   - Copiez le dossier `uploads` du ZIP vers ce dossier
   - Redémarrez l'application

---

## 🔍 Diagnostic Rapide

### Les images sont-elles dans la sauvegarde ?

```bash
node test_backup.js "votre_sauvegarde.zip"
```

- ✅ Si oui → Le problème est dans la restauration
- ❌ Si non → Le problème est dans la sauvegarde

### Où sont mes données ?

```bash
node check_storage_locations.js
```

Cela vous montre :
- 📁 Dossier dev : `Moonlight/server/uploads/`
- 📁 Dossier Electron : `%APPDATA%/moonlight-bar/uploads/`

### Les images ont-elles été restaurées ?

**Vérification manuelle** :
1. Appuyez sur `Win + R`
2. Tapez : `%APPDATA%\moonlight-bar`
3. Ouvrez le dossier `uploads`
4. Vérifiez qu'il contient des fichiers .png ou .jpg

---

## 🐛 Résolution de Problèmes

### Problème : "Aucun fichier dans uploads lors de la sauvegarde"

**Cause** : Vos produits n'ont pas d'images, ou les images ne sont pas au bon endroit

**Solution** :
1. Vérifiez que vos produits ont des images dans l'interface
2. Vérifiez le dossier `server/uploads/` (dev) ou `%APPDATA%\moonlight-bar\uploads\` (Electron)
3. Si le dossier est vide, ajoutez des images à vos produits

### Problème : "Les images sont dans le ZIP mais pas après restauration"

**Cause** : Erreur lors de l'extraction

**Solution** :
1. Regardez les logs lors de la restauration
2. Cherchez des erreurs comme "Erreur extraction..."
3. Utilisez la copie manuelle comme solution de secours

### Problème : "Port 3001 déjà utilisé"

**Cause** : Une autre instance du serveur est en cours

**Solution** :
```bash
taskkill /F /IM node.exe
```
Puis relancez le serveur.

---

## 📊 Logs à Surveiller

### Lors de la Sauvegarde

```
=== CRÉATION DE SAUVEGARDE ===
Chemin Uploads: C:\Users\willy\OneDrive\Desktop\Moonlight\server\uploads
Uploads existe: true
Nombre de fichiers dans uploads: 12
Fichiers: 1769337095561-815650476.png, ...
Ajout de la base de données au ZIP...
Ajout du dossier uploads au ZIP...
Finalisation de l'archive...
```

### Lors de la Restauration

```
=== RESTAURATION DE SAUVEGARDE ===
Nombre total d'entrées dans le ZIP: 14
  - moonlight.db (FILE)
  - uploads/ (DIR)
  - uploads/1769337095561-815650476.png (FILE)
Base de données trouvée: true
Fichiers uploads trouvés: 12
Extraction de la base de données...
Extraction des fichiers uploads...
  ✓ 1769337095561-815650476.png (317.52 KB)
  ✓ 1769341529268-185312513.png (234.31 KB)
12 fichiers extraits dans uploads.
Vérification: 12 fichiers présents dans C:\Users\...\uploads
```

---

## ✨ Améliorations Futures Possibles

- [ ] Interface de progression lors de la restauration
- [ ] Validation des images après restauration
- [ ] Sauvegarde incrémentielle (seulement les nouveaux fichiers)
- [ ] Compression optimisée des images
- [ ] Sauvegarde automatique programmée

---

## 📞 Support

Si vous rencontrez toujours des problèmes, fournissez :

1. Le résultat de `node test_backup.js "votre_sauvegarde.zip"`
2. Les logs complets de la restauration
3. Le résultat de `node check_storage_locations.js`
4. Une capture d'écran du dossier uploads

---

**Date de mise à jour** : 26 janvier 2026
**Version** : 1.1.0
