# Script PowerShell pour copier les images vers l'application Electron
# Usage: .\copy_images_to_electron.ps1

Write-Host "=== COPIE DES IMAGES VERS ELECTRON ===" -ForegroundColor Cyan
Write-Host ""

# Chemins
$devUploads = Join-Path $PSScriptRoot "server\uploads"
$electronData = Join-Path $env:APPDATA "moonlight-bar"
$electronUploads = Join-Path $electronData "uploads"

Write-Host "Source (Dev): $devUploads" -ForegroundColor Yellow
Write-Host "Destination (Electron): $electronUploads" -ForegroundColor Yellow
Write-Host ""

# Vérifier que le dossier source existe
if (-not (Test-Path $devUploads)) {
    Write-Host "ERREUR: Le dossier source n'existe pas!" -ForegroundColor Red
    Write-Host "Assurez-vous d'être dans le dossier Moonlight" -ForegroundColor Red
    exit 1
}

# Compter les fichiers source
$sourceFiles = Get-ChildItem -Path $devUploads -File
Write-Host "Fichiers trouvés dans Dev: $($sourceFiles.Count)" -ForegroundColor Green

if ($sourceFiles.Count -eq 0) {
    Write-Host "Aucun fichier à copier!" -ForegroundColor Yellow
    exit 0
}

# Créer le dossier Electron s'il n'existe pas
if (-not (Test-Path $electronData)) {
    Write-Host "Création du dossier Electron: $electronData" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $electronData -Force | Out-Null
}

if (-not (Test-Path $electronUploads)) {
    Write-Host "Création du dossier uploads: $electronUploads" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $electronUploads -Force | Out-Null
}

# Copier les fichiers
Write-Host ""
Write-Host "Copie en cours..." -ForegroundColor Cyan

$copiedCount = 0
foreach ($file in $sourceFiles) {
    $destPath = Join-Path $electronUploads $file.Name
    Copy-Item -Path $file.FullName -Destination $destPath -Force
    $copiedCount++
    
    if ($copiedCount -le 5) {
        Write-Host "  ✓ $($file.Name)" -ForegroundColor Green
    }
}

if ($copiedCount -gt 5) {
    Write-Host "  ... et $($copiedCount - 5) autres fichiers" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== TERMINÉ ===" -ForegroundColor Green
Write-Host "$copiedCount fichiers copiés avec succès!" -ForegroundColor Green
Write-Host ""
Write-Host "Vous pouvez maintenant lancer l'application Electron." -ForegroundColor Cyan
Write-Host "Les images des produits devraient s'afficher correctement." -ForegroundColor Cyan
