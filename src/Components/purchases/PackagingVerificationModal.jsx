import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

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
            empty_packaging_qty: qty,
            empty_secondary_packaging_qty: Math.floor(qty / 24),
            broken_packaging_qty: 0,
            broken_secondary_packaging_qty: 0,
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

    // Synchronous initialization whenever the target purchase group changes.
    // Using the group's id as the trigger (stable primitive) avoids the
    // "open prop changing before the dialog is mounted" timing problem that
    // caused the dialog to stay closed and freeze the UI.
    const purchaseGroupId = purchaseGroup?.id || null;
    useEffect(() => {
        if (!purchaseGroupId) {
            setPackagingData({});
            return;
        }
        setPackagingData(buildInitialData(purchaseGroup));
    }, [purchaseGroupId]);

    // Reset state when the dialog closes so the next opening starts fresh.
    useEffect(() => {
        if (!open) {
            setPackagingData({});
        }
    }, [open]);

    const verificationMutation = useMutation({
        mutationFn: async (data) => {
            return base44.entities.Packaging.verifyReception(data);
        },
        onSuccess: () => {
            toast.success('Vérification des emballages enregistrée !');
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

        // Always send all items from the order, regardless of empty packaging qty.
        // The backend will:
        //   1. Always add the full product quantity to the destination stock (when in_transit)
        //   2. Record empty packaging as consignment (only if > 0)
        //   3. Record breakage as loss (only if > 0)
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

    // Always render the Dialog (controlled by `open`) so Radix UI's Presence
    // mounts/unmounts the content correctly. Returning null when no group is
    // set caused the dialog to mount with `open=true` on the very first open
    // and get stuck in a transitional state (the modal appeared frozen).
    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-6 h-6 text-indigo-600" />
                        Réception de la commande
                    </DialogTitle>
                    <DialogDescription>
                        Vérifiez la commande ci-dessous. En validant, le stock produit sera automatiquement ajouté à votre emplacement. Renseignez les emballages vides (consigne fournisseur) et la casse éventuelle.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="rounded-xl bg-indigo-50/40 border border-indigo-100 p-3 text-sm text-indigo-900">
                        <strong>Réf :</strong> {purchaseGroup?.reference} •
                        <strong> Fournisseur :</strong> {purchaseGroup?.supplier_name || '—'} •
                        <strong> Produits :</strong> {purchaseGroup?.items?.length || 0}
                    </div>

                    {Object.keys(packagingData).length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                            {purchaseGroup
                                ? "Aucun produit à vérifier pour cette commande."
                                : "Chargement de la commande…"}
                        </div>
                    )}

                    {Object.values(packagingData).map(item => (
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
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                    Quantité commandée : {item.ordered_quantity}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-8">
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-500">Bouteilles Reçues</Label>
                                    <Input 
                                        type="number" 
                                        min="0" 
                                        value={item.empty_packaging_qty}
                                        onChange={(e) => handleChange(item.product_id, 'empty_packaging_qty', e.target.value)}
                                        className="h-8"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-500">Cageots Reçus</Label>
                                    <Input 
                                        type="number" 
                                        min="0" 
                                        value={item.empty_secondary_packaging_qty}
                                        onChange={(e) => handleChange(item.product_id, 'empty_secondary_packaging_qty', e.target.value)}
                                        className="h-8"
                                    />
                                </div>
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
                                
                                <div className="col-span-2 md:col-span-4 grid grid-cols-2 gap-4 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
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

                                <div className="col-span-2 md:col-span-4 space-y-1 mt-2">
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
                    ))}
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
                            : 'Valider la réception (ajouter au stock)'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
