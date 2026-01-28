# Guide de Dépannage - Sauvegarde et Restauration

## ⚠️ IMPORTANT : Application Electron (.exe)

Si vous utilisez **l'application Electron (fichier .exe)**, les données sont stockées dans un emplacement spécial :

### Emplacements de stockage

**Mode Développement (npm run dev)** :
- Base de données : `Moonlight/server/moonlight.db`
- Images : `Moonlight/server/uploads/`

**Mode Electron (.exe)** :
- Base de données : `%APPDATA%\moonlight-bar\moonlight.db`
- Images : `%APPDATA%\moonlight-bar\uploads\`

### Vérifier les emplacements

Exécutez ce script pour voir où sont vos données :
```bash
node check_storage_locations.js
```

### 🔧 Solution Rapide pour Electron

Si les images ne se chargent pas après restauration dans l'application .exe :

1. **Ouvrez le dossier de données Electron** :
   - Appuyez sur `Win + R`
   - Tapez : `%APPDATA%\moonlight-bar`
   - Appuyez sur Entrée

2. **Vérifiez le dossier `uploads`** :
   - Il devrait contenir vos images (fichiers .png, .jpg)
   - Si le dossier est vide ou n'existe pas, c'est le problème !

3. **Testez la restauration avec les nouveaux logs** :
   - Fermez l'application Electron
   - Ouvrez l'invite de commandes dans le dossier Moonlight
   - Lancez : `npm run server`
   - Dans l'application, faites Restaurer
   - Regardez les logs dans la console
   - Vous devriez voir : "X fichiers extraits dans uploads."

4. **Si ça ne fonctionne toujours pas** :
   - Extrayez manuellement le fichier ZIP de sauvegarde
   - Copiez le dossier `uploads/` du ZIP
   - Collez-le dans `%APPDATA%\moonlight-bar\`
   - Redémarrez l'application

---

## Problème : Les images ne sont pas sauvegardées/restaurées

### Diagnostic

1. **Vérifier que les images sont bien uploadées**
   - Ouvrez l'application
   - Allez dans la section Produits
   - Vérifiez que les images s'affichent correctement
   - Vérifiez le dossier `server/uploads/` - il devrait contenir des fichiers .png ou .jpg

2. **Tester la création de sauvegarde**
   ```bash
   # Démarrez l'application
   npm run dev
   
   # Dans l'interface, allez dans Paramètres > Gestion des Données
   # Cliquez sur "Sauvegarder"
   # Un fichier ZIP sera téléchargé
   ```

3. **Vérifier le contenu de la sauvegarde**
   ```bash
   # Utilisez le script de test
   node test_backup.js "chemin/vers/moonlight_backup_XXXX.zip"
   ```
   
   Ce script vous montrera :
   - ✅ Si la base de données est présente
   - ✅ Si les images sont présentes
   - 📊 Le nombre de fichiers et leur taille

### Solutions selon le diagnostic

#### Cas 1 : Les images ne sont PAS dans le ZIP
**Cause probable** : Le dossier uploads n'est pas au bon endroit ou n'est pas accessible

**Solution** :
1. Vérifiez les logs du serveur lors de la création de la sauvegarde
2. Cherchez les lignes :
   ```
   === CRÉATION DE SAUVEGARDE ===
   Chemin Uploads: ...
   Uploads existe: true/false
   Nombre de fichiers dans uploads: X
   ```
3. Si "Uploads existe: false", le problème vient du chemin

**Actions** :
- En mode développement : Les uploads devraient être dans `server/uploads/`
- En mode Electron : Les uploads sont dans `%APPDATA%/moonlight-bar/uploads/`

#### Cas 2 : Les images SONT dans le ZIP mais ne s'affichent pas après restauration
**Cause probable** : Les images ne sont pas extraites au bon endroit

**Solution** :
1. Vérifiez les logs lors de la restauration
2. Cherchez les lignes :
   ```
   === RESTAURATION DE SAUVEGARDE ===
   Fichiers uploads trouvés: X
   X fichiers extraits dans uploads.
   ```
3. Vérifiez que le dossier uploads contient bien les fichiers après restauration

#### Cas 3 : Les chemins d'images dans la base de données sont incorrects
**Cause probable** : Les URLs des images sont absolues au lieu d'être relatives

**Solution** :
```bash
# Exécutez le script de correction
node server/fix_image_urls.js
```

### Test complet de bout en bout

1. **Créer des données de test**
   - Ajoutez 2-3 produits avec des images
   - Notez les noms des produits

2. **Créer une sauvegarde**
   - Paramètres > Sauvegarder
   - Téléchargez le fichier ZIP

3. **Vérifier la sauvegarde**
   ```bash
   node test_backup.js "Downloads/moonlight_backup_XXX.zip"
   ```
   Vous devriez voir vos images listées

4. **Tester la restauration**
   - Paramètres > Restaurer
   - Sélectionnez le fichier ZIP
   - L'application redémarre
   - Vérifiez que les produits ET leurs images sont présents

### Logs importants à surveiller

Lors de la **sauvegarde**, vous devriez voir :
```
=== CRÉATION DE SAUVEGARDE ===
Chemin DB: C:\Users\...\moonlight.db
Chemin Uploads: C:\Users\...\uploads
DB existe: true
Uploads existe: true
Nombre de fichiers dans uploads: 12
Fichiers: 1769337095561-815650476.png, ...
Ajout de la base de données au ZIP...
Ajout du dossier uploads au ZIP...
Finalisation de l'archive...
```

Lors de la **restauration**, vous devriez voir :
```
=== RESTAURATION DE SAUVEGARDE ===
Nombre total d'entrées dans le ZIP: 14
  - moonlight.db (FILE)
  - uploads/ (DIR)
  - uploads/1769337095561-815650476.png (FILE)
  ...
Base de données trouvée: true
Fichiers uploads trouvés: 12
Extraction de la base de données...
Base de données extraite avec succès.
Nettoyage du dossier uploads existant...
12 fichiers supprimés.
Extraction des uploads vers: C:\Users\...
12 fichiers extraits dans uploads.
```

### Checklist finale

- [ ] Les images s'affichent dans l'application avant sauvegarde
- [ ] Le fichier ZIP contient le dossier `uploads/` avec les images (vérifier avec test_backup.js)
- [ ] Les logs de sauvegarde montrent "Nombre de fichiers dans uploads: X" (X > 0)
- [ ] Les logs de restauration montrent "X fichiers extraits dans uploads" (X > 0)
- [ ] Après restauration, les images s'affichent dans l'application

### Contact

Si le problème persiste après avoir suivi ce guide, fournissez :
1. Les logs complets de la sauvegarde
2. Les logs complets de la restauration
3. Le résultat de `node test_backup.js`
4. Une capture d'écran du dossier `server/uploads/`
