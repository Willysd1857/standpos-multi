# 🔧 Solution : Images manquantes après restauration

## Le Problème

Vous avez créé une sauvegarde de Moonlight, mais après l'avoir restaurée sur un autre PC (ou dans l'application .exe), **les images des produits ne s'affichent pas**.

## La Cause

L'application Electron stocke les données dans un dossier spécial (`%APPDATA%\moonlight-bar\`) et non dans le dossier de l'application. Le système de restauration a été amélioré pour extraire correctement les images.

## ✅ Solution Automatique (Recommandée)

### Étape 1 : Vérifier la sauvegarde

Avant de restaurer, vérifiez que votre fichier ZIP contient bien les images :

```bash
node test_backup.js "chemin\vers\votre_sauvegarde.zip"
```

Vous devriez voir :
```
✅ Base de données trouvée: moonlight.db
📁 Dossier uploads:
   Nombre de fichiers: 12
   Fichiers images:
   - uploads/1769337095561-815650476.png (317.52 KB)
   ...
```

### Étape 2 : Restaurer avec les logs

1. **Fermez l'application Electron** si elle est ouverte

2. **Lancez le serveur en mode console** pour voir les logs :
   ```bash
   cd C:\chemin\vers\Moonlight
   npm run server
   ```

3. **Ouvrez l'application dans le navigateur** :
   - Allez sur `http://localhost:3001`

4. **Restaurez la sauvegarde** :
   - Paramètres > Gestion des Données > Restaurer
   - Sélectionnez votre fichier ZIP
   - **Regardez les logs dans la console**

5. **Vérifiez les logs** - Vous devriez voir :
   ```
   === RESTAURATION DE SAUVEGARDE ===
   Fichiers uploads trouvés: 12
   Extraction des fichiers uploads...
     ✓ 1769337095561-815650476.png (317.52 KB)
     ✓ 1769341529268-185312513.png (234.31 KB)
     ...
   12 fichiers extraits dans uploads.
   Vérification: 12 fichiers présents dans C:\Users\...\uploads
   ```

6. **Redémarrez l'application Electron**

### Étape 3 : Vérifier

Ouvrez l'application et vérifiez que les images des produits s'affichent.

---

## 🛠️ Solution Manuelle (Si l'automatique ne fonctionne pas)

### Option 1 : Script PowerShell (Windows)

```powershell
.\copy_images_to_electron.ps1
```

Ce script copie automatiquement les images du dossier de développement vers le dossier Electron.

### Option 2 : Copie manuelle

1. **Extrayez le fichier ZIP de sauvegarde** dans un dossier temporaire

2. **Ouvrez le dossier Electron** :
   - Appuyez sur `Win + R`
   - Tapez : `%APPDATA%\moonlight-bar`
   - Appuyez sur Entrée

3. **Copiez le dossier `uploads`** :
   - Du ZIP extrait → vers `%APPDATA%\moonlight-bar\`
   - Remplacez les fichiers si demandé

4. **Redémarrez l'application**

---

## 🔍 Diagnostic

### Vérifier où sont vos données

```bash
node check_storage_locations.js
```

Ce script vous montre :
- Où sont stockées les données en mode dev
- Où sont stockées les données en mode Electron
- Combien de fichiers images sont présents

### Vérifier le contenu d'une sauvegarde

```bash
node test_backup.js "Downloads\moonlight_backup_2026-01-26.zip"
```

---

## 📝 Checklist de Vérification

Avant de dire que ça ne fonctionne pas, vérifiez :

- [ ] Le fichier ZIP contient bien le dossier `uploads/` avec des images (utilisez `test_backup.js`)
- [ ] Vous avez bien regardé les logs lors de la restauration
- [ ] Les logs montrent "X fichiers extraits dans uploads" (X > 0)
- [ ] Le dossier `%APPDATA%\moonlight-bar\uploads\` contient des fichiers
- [ ] Vous avez redémarré l'application après la restauration

---

## 🆘 Besoin d'aide ?

Si le problème persiste, fournissez :

1. **Le résultat de** `node test_backup.js "votre_sauvegarde.zip"`
2. **Les logs complets** de la restauration (copiez tout ce qui s'affiche dans la console)
3. **Une capture d'écran** du dossier `%APPDATA%\moonlight-bar\uploads\`
4. **Le résultat de** `node check_storage_locations.js`

---

## 💡 Pourquoi ce problème existe ?

L'application Electron utilise un dossier système spécial pour stocker les données (pour des raisons de sécurité et de permissions). Ce dossier est différent selon :
- L'utilisateur Windows
- Le PC

C'est pourquoi une simple copie du dossier Moonlight ne suffit pas - il faut utiliser la fonction Sauvegarde/Restauration qui gère ces chemins automatiquement.

Avec les améliorations apportées, le système devrait maintenant **extraire correctement les images** dans le bon dossier, quel que soit l'environnement (dev ou Electron).
