import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Download, Upload, FileSpreadsheet, CheckCircle,
    XCircle, AlertCircle, X, ChevronRight, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// ── Constantes ───────────────────────────────────────────────────────────────
const STEPS = ['template', 'upload', 'preview', 'result'];

const STEP_LABELS = {
    template: '1. Modèle',
    upload: '2. Fichier',
    preview: '3. Aperçu',
    result: '4. Résultat',
};

// ── Composant principal ──────────────────────────────────────────────────────
export default function ProductImportExcel({ open, onClose, onImportDone }) {
    const [step, setStep] = useState('template');
    const [parsedRows, setParsedRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const fileInputRef = useRef(null);

    const reset = () => {
        setStep('template');
        setParsedRows([]);
        setFileName('');
        setImportResult(null);
        setIsImporting(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    // ── Téléchargement du modèle ─────────────────────────────────────────────
    const handleDownloadTemplate = async () => {
        try {
            const res = await fetch('/api/products/import/template');
            if (!res.ok) throw new Error('Erreur serveur');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'modele_import_produits.xlsx';
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Modèle téléchargé avec succès');
        } catch (err) {
            toast.error('Erreur lors du téléchargement du modèle');
        }
    };

    // ── Parsing local du fichier ─────────────────────────────────────────────
    const parseFile = useCallback((file) => {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'xlsx' && ext !== 'xls') {
            toast.error('Seuls les fichiers .xlsx ou .xls sont acceptés.');
            return;
        }
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (rows.length === 0) {
                    toast.error('Le fichier ne contient aucune donnée.');
                    return;
                }
                setParsedRows(rows);
                setStep('preview');
            } catch (err) {
                toast.error('Impossible de lire le fichier Excel.');
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const handleFileInput = (e) => parseFile(e.target.files[0]);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        parseFile(e.dataTransfer.files[0]);
    };

    // ── Envoi au serveur ─────────────────────────────────────────────────────
    const handleImport = async () => {
        if (!fileInputRef.current?.files[0] && parsedRows.length === 0) return;
        setIsImporting(true);
        try {
            // On reconstruit le fichier depuis les données parsées pour l'envoyer
            let fileToSend = fileInputRef.current?.files[0];

            // Si le fichier vient du drag-and-drop, on le reconstruit depuis parsedRows
            if (!fileToSend) {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(parsedRows);
                XLSX.utils.book_append_sheet(wb, ws, 'Produits');
                const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
                fileToSend = new File([buf], fileName || 'import.xlsx', {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }

            const formData = new FormData();
            formData.append('file', fileToSend);

            const res = await fetch('/api/products/import', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur serveur');

            setImportResult(data);
            setStep('result');
            if (data.added > 0 && onImportDone) onImportDone();
        } catch (err) {
            toast.error(`Erreur : ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    // ── Rendu des étapes ─────────────────────────────────────────────────────
    const renderStepIndicator = () => (
        <div className="flex items-center gap-1 mb-6">
            {STEPS.map((s, i) => {
                const stepIdx = STEPS.indexOf(step);
                const isActive = s === step;
                const isDone = STEPS.indexOf(s) < stepIdx;
                return (
                    <React.Fragment key={s}>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-200' :
                                isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                            }`}>
                            {isDone ? <CheckCircle className="w-3 h-3" /> : null}
                            {STEP_LABELS[s]}
                        </div>
                        {i < STEPS.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );

    // Étape 1 : Modèle
    const renderTemplate = () => (
        <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-6 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
                    <FileSpreadsheet className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800 text-lg">Téléchargez le modèle Excel</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Remplissez le fichier modèle avec vos produits, puis importez-le à l'étape suivante.
                    </p>
                </div>
                <Button
                    onClick={handleDownloadTemplate}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-blue-200 gap-2"
                >
                    <Download className="w-4 h-4" />
                    Télécharger le modèle
                </Button>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm space-y-2">
                <p className="font-semibold text-gray-700">Colonnes du modèle :</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {[
                        ['nom', 'Obligatoire'],
                        ['prix_vente', 'Obligatoire'],
                        ['prix_achat', 'Optionnel'],
                        ['stock', 'Optionnel (défaut: 0)'],
                        ['stock_minimum', 'Optionnel (défaut: 5)'],
                        ['unite', 'Optionnel (défaut: pièces)'],
                        ['categorie', 'Optionnel'],
                        ['type_produit', 'Optionnel (direct/raw_material/recipe)'],
                        ['actif', 'Optionnel (OUI/NON)'],
                    ].map(([col, desc]) => (
                        <div key={col} className="flex items-start gap-1.5">
                            <code className="bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono text-blue-700 flex-shrink-0">{col}</code>
                            <span className="text-gray-500">{desc}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={() => setStep('upload')}
                    variant="outline"
                    className="rounded-xl gap-2"
                >
                    J'ai mon fichier prêt
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );

    // Étape 2 : Upload
    const renderUpload = () => (
        <div className="space-y-5">
            <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${isDragging
                        ? 'border-blue-400 bg-blue-50 scale-[1.02]'
                        : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <Upload className={`w-12 h-12 mx-auto mb-3 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-300'}`} />
                <p className="font-semibold text-gray-700">
                    {isDragging ? 'Déposez le fichier ici' : 'Glissez-déposez votre fichier Excel'}
                </p>
                <p className="text-sm text-gray-400 mt-1">ou cliquez pour sélectionner</p>
                <p className="text-xs text-gray-400 mt-2">Formats acceptés : .xlsx, .xls (max 10 Mo)</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileInput}
                />
            </div>
            <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('template')} className="rounded-xl">
                    ← Retour
                </Button>
            </div>
        </div>
    );

    // Étape 3 : Aperçu
    const renderPreview = () => {
        const columns = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : [];
        const preview = parsedRows.slice(0, 10);
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-gray-800">{fileName}</span>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        {parsedRows.length} ligne{parsedRows.length > 1 ? 's' : ''} détectée{parsedRows.length > 1 ? 's' : ''}
                    </Badge>
                </div>

                <div className="overflow-auto max-h-64 rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {columns.map(col => (
                                    <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 border-b whitespace-nowrap">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {preview.map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                    {columns.map(col => (
                                        <td key={col} className="px-3 py-1.5 border-b border-gray-100 whitespace-nowrap max-w-[160px] truncate">
                                            {String(row[col] ?? '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {parsedRows.length > 10 && (
                        <p className="text-center text-xs text-gray-400 py-2">
                            … et {parsedRows.length - 10} ligne(s) supplémentaire(s)
                        </p>
                    )}
                </div>

                <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => { setParsedRows([]); setFileName(''); setStep('upload'); }} className="rounded-xl">
                        ← Changer de fichier
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={isImporting}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-blue-200 gap-2"
                    >
                        {isImporting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Importation…</>
                        ) : (
                            <><Upload className="w-4 h-4" /> Importer {parsedRows.length} produit{parsedRows.length > 1 ? 's' : ''}</>
                        )}
                    </Button>
                </div>
            </div>
        );
    };

    // Étape 4 : Résultat
    const renderResult = () => {
        if (!importResult) return null;
        const { added, skipped, errorCount, details } = importResult;
        return (
            <div className="space-y-4">
                {/* Cartes récapitulatif */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
                        <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-green-700">{added}</p>
                        <p className="text-xs text-green-600">Ajouté{added > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                        <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-600">{skipped}</p>
                        <p className="text-xs text-amber-600">Ignoré{skipped > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                        <XCircle className="w-6 h-6 text-red-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                        <p className="text-xs text-red-600">Erreur{errorCount > 1 ? 's' : ''}</p>
                    </div>
                </div>

                {/* Détails */}
                {(details?.skipped?.length > 0 || details?.errors?.length > 0) && (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-gray-100 p-3 bg-gray-50 text-xs">
                        {details.errors?.map((e, i) => (
                            <div key={`e-${i}`} className="flex items-start gap-2 text-red-600">
                                <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span><strong>Ligne {e.ligne}{e.nom ? ` (${e.nom})` : ''} :</strong> {e.erreur}</span>
                            </div>
                        ))}
                        {details.skipped?.map((s, i) => (
                            <div key={`s-${i}`} className="flex items-start gap-2 text-amber-600">
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span><strong>Ligne {s.ligne} ({s.nom}) :</strong> {s.raison}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-between">
                    <Button variant="ghost" onClick={reset} className="rounded-xl">
                        Nouvel import
                    </Button>
                    <Button
                        onClick={handleClose}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl gap-2"
                    >
                        <CheckCircle className="w-4 h-4" />
                        Terminer
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl rounded-2xl p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                        Importer des produits via Excel
                    </DialogTitle>
                </DialogHeader>

                {renderStepIndicator()}

                {step === 'template' && renderTemplate()}
                {step === 'upload' && renderUpload()}
                {step === 'preview' && renderPreview()}
                {step === 'result' && renderResult()}
            </DialogContent>
        </Dialog>
    );
}
