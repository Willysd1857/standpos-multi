# Test de l'utilisation des ingrédients

## Instructions de test

1. **Ouvrir l'application** dans le navigateur
2. **Naviguer** vers la page "Utilisation des Ingrédients"
3. **Ouvrir la console développeur** (F12)
4. **Cliquer** sur le bouton "Nouvelle Utilisation"
5. **Cliquer** sur "Ajouter" pour ajouter un ingrédient
6. **Sélectionner** un ingrédient dans la liste déroulante
7. **Entrer** une quantité (ex: 1)
8. **Cliquer** sur "Enregistrer"

## Ce qui devrait apparaître dans la console

Si tout fonctionne correctement, vous devriez voir ces logs dans la console :

```
🔍 Form submit triggered
📋 Selected ingredients: [...]
✅ Valid ingredients: [...]
📤 Submitting payload: {...}
🚀 Sending request to backend: {...}
📡 Response status: 201
✅ Backend response: {...}
🎉 Usage created successfully: {...}
```

Puis une alerte de succès devrait s'afficher avec la référence.

## En cas d'erreur

Si une erreur se produit, vous verrez :
- ⚠️ Messages d'avertissement pour les problèmes de validation
- ❌ Messages d'erreur pour les problèmes backend
- 💥 Messages d'erreur pour les problèmes de mutation

Une alerte d'erreur s'affichera avec le message détaillé.

## Vérification dans la base de données

Après un enregistrement réussi, vous pouvez vérifier les données avec :

```bash
node -e "const {db} = require('./server/database.js'); const groups = db.prepare('SELECT * FROM ingredient_usage_groups ORDER BY created_at DESC LIMIT 5').all(); console.log(groups);"
```
