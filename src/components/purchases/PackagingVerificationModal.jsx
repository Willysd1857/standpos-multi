import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, CheckCircle2, AlertCircle, ArrowDownRight, Scale } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44, fetchAPI } from '@/api/base44Client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

function buildInitialData(purchaseGroup) {
    if (!purchaseGroup || !Array.isArray(purchaseGroup.items)) return {};
    const initialData = {};
    purchaseGroup.items.forEach(item => {
        if (!item || !item.product_id) return;
        const qty = Number(item.quantity) || 0;
        initialData[item.product_id] = {
            product_id: item.product_id,
            product_name: item.product_name || 'Produit',
            ordered_quantity: qty,
            // Emballages vides REÇUS du fournisseur (= consignes à retourner)
            received_empty_bottles: 0,
            received_empty_crates: 0,
            // Casse éventuelle
            broken_packaging_qty: 0,
            broken_secondary_packaging_qty: 0,
            // Valeurs des consignes
            packaging_deposit_value: 500,
            secondary_packaging_deposit_value: 3500,
            notes: '',
            verified: false
        };
    });
    return initialData;
}

export default function PackagingVerificationModal({ open, onClose, purchaseGroup, onVerified }) {
    const [packagingData, setPackagingData] = useState({});

    const purchaseGroupId = purchaseGroup?.id || null;
    useEffect(() => {
        if (!purchaseGroupId) {
            setPackagingData({});
            return;
        }
        setPackagingData(buildInitialData(purchaseGroup));
    }, [purchaseGroupId]);

    useEffect(() => {
        if (!open) {
            setPackagingData({});
        }
    }, [open]);

    const { user } = useAuth();

    // Fetch stock for current location to show available empty packagings
    const { data: locationStockData } = useQuery({
        queryKey: ['location-packaging-stock', purchaseGroup?.location_id || user?.location_id],
        queryFn: () => fetchAPI(`/locations/${purchaseGroup?.location_id || user?.location_id}/packaging-stock`),
        enabled: !!(purchaseGroup?.location_id || user?.location_id) && open
    });
    
    const stockMap = useMemo(() => {
        const m = new Map();
        if (locationStockData?.items) {
            for (const s of locationStockData.items) {
                m.set(s.product_id, {
                    b: Number(s.empty_packaging_qty) || 0,
                    c: Number(s.empty_secondary_packaging_qty) || 0
                });
            }
        }
        return m;
    }, [locationStockData]);

    // Calculs en temps réel : total emballages reçus = échange immédiat + déficit (consigne)
    const gapSummary = useMemo(() => {
        const items = Object.values(packagingData);
        let totalOrdered = 0;
        let totalReceivedEmpty = 0;
        let totalExchange = 0;
        let totalConsign = 0;

        for (const item of items) {
            const ordered = Number(item.ordered_quantity) || 0;
            const received = Number(item.received_empty_bottles) || 0;
            
            const stock = stockMap.get(item.product_id);
            const availableB = stock ? stock.b : 0;
            const exchangeB = Math.min(availableB, received);
            const consignB = received - exchangeB;

            totalOrdered += ordered;
            totalReceivedEmpty += received;
            totalExchange += exchangeB;
            totalConsign += consignB;
        }

        return { totalOrdered, totalReceivedEmpty, totalExchange, totalConsign };
    }, [packagingData, stockMap]);

    const verificationMutation = useMutation({
        mutationFn: async (data) => {
            return base44.entities.Packaging.verifyReception(data);
        },
        onSuccess: (response) => {
            if (response?.consignment_errors?.length > 0) {
                toast.warning(`Réception enregistrée mais ${response.consignment_errors.length} emballage(s) n'ont pas pu être enregistré(s) en consigne. Vérifiez les logs serveur.`, { duration: 8000 });
            } else {
                toast.success('Réception enregistrée avec succès !');
            }
            onVerified();
        },
        onError: (error) => {
            toast.error(`Erreur lors de la vérification: ${error.message}`);
        }
    });

    const handleVerifyItem = (productId) => {
        setPackagingData(prev => ({
            ...prev,
            [productId]: { ...prev[productId], verified: !prev[productId].verified }
        }));
    };

    const handleChange = (productId, field, value) => {
        setPackagingData(prev => ({
            ...prev,
            [productId]: { ...prev[productId], [field]: Number(value) }
        }));
    };

    const handleTextChange = (productId, field, value) => {
        setPackagingData(prev => ({
            ...prev,
            [productId]: { ...prev[productId], [field]: value }
        }));
    };

    const handleSubmit = () => {
        if (!purchaseGroup) return;

        const itemsToVerify = Object.values(packagingData).filter(item => item.product_id);

        if (itemsToVerify.length === 0) {
            onVerified();
            return;
        }

        verificationMutation.mutate({
            purchase_id: purchaseGroup.id,
            supplier_id: purchaseGroup.supplier_id || 'unknown',
            supplier_name: purchaseGroup.supplier_name || 'Fournisseur Inconnu',
            items: itemsToVerify
        });
    };

    // Déterminer le scénario global
    const globalScenario = useMemo(() => {
        if (gapSummary.totalReceivedEmpty > 0) return 'consignment';
        return 'none';
    }, [gapSummary]);

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-6 h-6 text-indigo-600" />
                        Réception de la commande — Échange d'emballages
                    </DialogTitle>
                    <DialogDescription>
                        Saisissez le nombre d'emballages vides reçus du fournisseur. Le système enregistre automatiquement la consigne à retourner.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* En-tête commande */}
                    <div className="rounded-xl bg-indigo-50/40 border border-indigo-100 p-3 text-sm text-indigo-900">
                        <strong>Réf :</strong> {purchaseGroup?.reference} •
                        <strong> Fournisseur :</strong> {purchaseGroup?.supplier_name || '—'} •
                        <strong> Produits :</strong> {purchaseGroup?.items?.length || 0}
                    </div>

                    {/* Résumé de l'échange */}
                    {gapSummary.totalReceivedEmpty > 0 && (
                        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Scale className="w-5 h-5 text-indigo-600" />
                                <h4 className="font-bold text-gray-800">Résumé de l'échange</h4>
                            </div>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                                <div className="text-center">
                                    <p className="text-gray-500 text-xs">Produits reçus</p>
                                    <p className="text-lg font-bold text-gray-700">{gapSummary.totalOrdered}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-500 text-xs">Emballages réclamés</p>
                                    <p className="text-lg font-bold text-indigo-700">{gapSummary.totalReceivedEmpty}</p>
                                </div>
                                <div className="text-center bg-green-50 rounded-lg py-1 border border-green-100">
                                    <p className="text-green-600 text-xs font-semibold">Échangés (stock)</p>
                                    <p className="text-lg font-bold text-green-700">{gapSummary.totalExchange}</p>
                                </div>
                                <div className="text-center bg-amber-50 rounded-lg py-1 border border-amber-100">
                                    <p className="text-amber-600 text-xs font-semibold">Déficit (consigné)</p>
                                    <p className="text-lg font-bold text-amber-700">{gapSummary.totalConsign}</p>
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-center flex items-center justify-center gap-2">
                                {gapSummary.totalExchange > 0 && (
                                    <span className="text-green-700 font-medium">
                                        ✅ {gapSummary.totalExchange} emballage(s) échangé(s) depuis votre stock vide.
                                    </span>
                                )}
                                {gapSummary.totalConsign > 0 && (
                                    <span className="text-amber-700 font-medium">
                                        ⚠️ {gapSummary.totalConsign} emballage(s) manquant(s) seront enregistrés en dette (consigne).
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {Object.keys(packagingData).length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                            {purchaseGroup
                                ? "Aucun produit à vérifier pour cette commande."
                                : "Chargement de la commande…"}
                        </div>
                    )}

                    {Object.values(packagingData).map(item => {
                        const ordered = Number(item.ordered_quantity) || 0;
                        const receivedEmpty = Number(item.received_empty_bottles) || 0;

                        return (
                            <div key={item.product_id} className={`p-4 rounded-xl border-2 transition-colors ${item.verified ? 'border-green-500 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleVerifyItem(item.product_id)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${item.verified ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                                        >
                                            {item.verified && <CheckCircle2 className="w-4 h-4 text-white" />}
                                        </button>
                                        {item.product_name}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        {receivedEmpty > 0 && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-700">
                                                <ArrowDownRight className="w-3 h-3" />
                                                {receivedEmpty} consigné(s)
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                            Reçus : {ordered}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pl-8">
                                    {/* Colonne 1 : Emballages vides réclamés par fournisseur */}
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-indigo-700 flex items-center justify-between gap-1">
                                            <span className="flex items-center gap-1">
                                                <ArrowDownRight className="w-3 h-3"/>
                                                Bouteilles Réclamées
                                            </span>
                                        </Label>
                                        <div className="relative">
                                            <Input 
                                                type="number" 
                                                min="0" 
                                                max={ordered + 100}
                                                value={item.received_empty_bottles}
                                                onChange={(e) => handleChange(item.product_id, 'received_empty_bottles', e.target.value)}
                                                className="h-8 border-indigo-300 focus-visible:ring-indigo-500"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400">Emballages du fournisseur</span>
                                            <span className="text-green-600 font-medium bg-green-50 px-1 rounded border border-green-100">Dispo: {stockMap.get(item.product_id)?.b || 0}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-indigo-700 flex items-center justify-between gap-1">
                                            <span className="flex items-center gap-1">
                                                <ArrowDownRight className="w-3 h-3"/>
                                                Cageots Réclamés
                                            </span>
                                        </Label>
                                        <div className="relative">
                                            <Input 
                                                type="number" 
                                                min="0"
                                                value={item.received_empty_crates}
                                                onChange={(e) => handleChange(item.product_id, 'received_empty_crates', e.target.value)}
                                                className="h-8 border-indigo-300 focus-visible:ring-indigo-500"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400">Emballages du fournisseur</span>
                                            <span className="text-green-600 font-medium bg-green-50 px-1 rounded border border-green-100">Dispo: {stockMap.get(item.product_id)?.c || 0}</span>
                                        </div>
                                    </div>

                                    {/* Colonne 2 : Casse */}
                                    <div className="space-y-1">
                                        <Label className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Bouteilles Cassées</Label>
                                        <Input 
                                            type="number" 
                                            min="0" 
                                            value={item.broken_packaging_qty}
                                            onChange={(e) => handleChange(item.product_id, 'broken_packaging_qty', e.target.value)}
                                            className="h-8 border-red-200 focus-visible:ring-red-500"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Cageots Cassés</Label>
                                        <Input 
                                            type="number" 
                                            min="0" 
                                            value={item.broken_secondary_packaging_qty}
                                            onChange={(e) => handleChange(item.product_id, 'broken_secondary_packaging_qty', e.target.value)}
                                            className="h-8 border-red-200 focus-visible:ring-red-500"
                                        />
                                    </div>
                                    
                                    {/* Colonne 3 : Valeurs consignes */}
                                    <div className="col-span-2 md:col-span-2 grid grid-cols-2 gap-4 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold text-gray-700">Valeur Consigne Bouteille (Ar)</Label>
                                            <Input 
                                                type="number" 
                                                min="0" 
                                                value={item.packaging_deposit_value}
                                                onChange={(e) => handleChange(item.product_id, 'packaging_deposit_value', e.target.value)}
                                                className="h-8 bg-white"
                                                placeholder="Ex: 500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold text-gray-700">Valeur Consigne Cageot (Ar)</Label>
                                            <Input 
                                                type="number" 
                                                min="0" 
                                                value={item.secondary_packaging_deposit_value}
                                                onChange={(e) => handleChange(item.product_id, 'secondary_packaging_deposit_value', e.target.value)}
                                                className="h-8 bg-white"
                                                placeholder="Ex: 3500"
                                            />
                                        </div>
                                    </div>

                                    {/* Ligne de résumé par produit */}
                                    {ordered > 0 && (
                                        <div className={`col-span-2 md:col-span-3 p-2 rounded-lg text-xs font-medium ${
                                            receivedEmpty > 0 ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                            'bg-gray-50 text-gray-600 border border-gray-200'
                                        }`}>
                                            <strong>{item.product_name}</strong> : {ordered} produit(s) reçu(s), {receivedEmpty} emballage(s) réclamé(s).
                                            {receivedEmpty > 0 && (() => {
                                                const avail = stockMap.get(item.product_id)?.b || 0;
                                                const exch = Math.min(avail, receivedEmpty);
                                                const def = receivedEmpty - exch;
                                                return ` → ${exch} échangé(s) du stock, ${def > 0 ? def + ' en dette (consigne)' : ''}`;
                                            })()}
                                        </div>
                                    )}

                                    <div className="col-span-2 md:col-span-3 space-y-1 mt-2">
                                        <Label className="text-xs text-gray-500">Note sur la casse (Optionnel)</Label>
                                        <Input 
                                            type="text" 
                                            placeholder="Ex: Cassé lors du déchargement"
                                            value={item.notes}
                                            onChange={(e) => handleTextChange(item.product_id, 'notes', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={verificationMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {verificationMutation.isPending
                            ? 'Enregistrement...'
                            : 'Valider la réception'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
