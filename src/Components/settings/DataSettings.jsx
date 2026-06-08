import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, FileSpreadsheet, Download, RefreshCw, Archive, Upload, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { base44 } from '@/api/base44Client';

export default function DataSettings() {
    const { isAdmin } = useAuth();
    const [isExporting, setIsExporting] = useState(false);
    const [isWiping, setIsWiping] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await fetch('/api/export/download');
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `StandPOS_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                console.error('Export failed');
                toast.error('Erreur lors de l\'exportation des données.');
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            toast.error('Une erreur est survenue.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleResetData = async () => {
        toast('Cette action va supprimer TOUTES les transactions, ventes, dépenses et journaux d\'audit. Cette action est irréversible. Voulez-vous vraiment continuer ?', {
            duration: 10000,
            action: {
                label: 'OUI, SUPPRIMER TOUT',
                onClick: async () => {
                    toast('Dernière confirmation : Êtes-vous ABSOLUMENT certain ?', {
                        action: {
                            label: 'CONFIRMER LA SUPPRESSION',
                            onClick: async () => {
                                setIsWiping(true);
                                try {
                                    await base44.entities.Settings.wipeData();
                                    toast.success('Réinitialisation terminée. L\'application va redémarrer.');
                                    setTimeout(() => window.location.reload(), 2000);
                                } catch (error) {
                                    console.error('Wipe failed:', error);
                                    toast.error('Erreur: ' + (error.message || 'La suppression a échoué.'));
                                } finally {
                                    setIsWiping(false);
                                }
                            }
                        }
                    });
                }
            }
        });
    };

    return (
        <div className="max-w-3xl space-y-6">
            <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-green-50">
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Database className="w-6 h-6 text-emerald-600" />
                        Gestion des Données
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        Exportez vos données pour vos archives ou analyses
                    </p>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between p-4 border rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white rounded-lg border shadow-sm">
                                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Export Excel Complet</h3>
                                <p className="text-sm text-gray-500 mt-1 max-w-md">
                                    Téléchargez un fichier Excel (.xlsx) contenant tous vos produits, ventes, dépenses et mouvements de stock.
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
                        >
                            {isExporting ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Export en cours...
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4 mr-2" />
                                    Télécharger Excel
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors mt-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white rounded-lg border shadow-sm">
                                <Archive className="w-8 h-8 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Sauvegarde et Restauration</h3>
                                <p className="text-sm text-gray-500 mt-1 max-w-md">
                                    Créez une sauvegarde complète (Base de données + Images) ou restaurez une sauvegarde existante.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => {
                                    window.open('/api/backup/create', '_blank');
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Sauvegarder
                            </Button>

                            <label className="relative">
                                <input
                                    type="file"
                                    accept=".zip"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        toast('ATTENTION: La restauration va REMPLACER toutes vos données. Continuer ?', {
                                            action: {
                                                label: 'Restaurer',
                                                onClick: async () => {
                                                    const formData = new FormData();
                                                    formData.append('file', file);

                                                    setIsExporting(true);
                                                    try {
                                                        const res = await fetch('/api/backup/restore', {
                                                            method: 'POST',
                                                            body: formData
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            toast.success('Restauration réussie ! L\'application va redémarrer.');
                                                            setTimeout(() => window.location.reload(), 2000);
                                                        } else {
                                                            toast.error('Erreur: ' + data.error);
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        toast.error('Erreur technique. Le serveur a peut-être redémarré.');
                                                        setTimeout(() => window.location.reload(), 2000);
                                                    } finally {
                                                        setIsExporting(false);
                                                        e.target.value = null;
                                                    }
                                                }
                                            }
                                        });
                                    }}
                                />
                                <Button
                                    asChild
                                    className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 cursor-pointer"
                                >
                                    <span>
                                        <Upload className="w-4 h-4 mr-2" />
                                        Restaurer
                                    </span>
                                </Button>
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isAdmin() && (
                <Card className="border-2 border-red-100 shadow-lg overflow-hidden">
                    <CardHeader className="border-b bg-red-50">
                        <CardTitle className="flex items-center gap-2 text-xl text-red-700">
                            <AlertTriangle className="w-6 h-6" />
                            Zone de Danger
                        </CardTitle>
                        <p className="text-sm text-red-600 mt-1">
                            Actions irréversibles pour l'administration uniquement
                        </p>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between p-4 border border-red-200 rounded-xl bg-red-50/30">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-white rounded-lg border border-red-100 shadow-sm">
                                    <Trash2 className="w-8 h-8 text-red-600" />
                                </div>
                                <div className="max-w-md">
                                    <h3 className="font-semibold text-red-900">Réinitialiser les Transactions</h3>
                                    <p className="text-sm text-red-600 mt-1">
                                        Efface toutes les ventes, dépenses, mouvements de stock, transferts, emballages, stocks des entrepôts et journaux d'audit.
                                        Les produits et les catégories seront conservés.
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={handleResetData}
                                disabled={isWiping}
                                variant="destructive"
                                className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 px-6"
                            >
                                {isWiping ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        Suppression...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Tout Réinitialiser
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
