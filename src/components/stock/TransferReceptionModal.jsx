import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PackageCheck, AlertCircle } from 'lucide-react';

export default function TransferReceptionModal({ open, onClose, transfer, onConfirm, isPending }) {
    const [verifiedItems, setVerifiedItems] = useState([]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (open && transfer && transfer.stock_transfer_items) {
            setVerifiedItems(transfer.stock_transfer_items.map(item => ({
                id: item.id,
                product_id: item.product_id,
                product_name: item.product_name || 'Produit',
                expected_quantity: item.quantity,
                expected_empty_packaging_qty: item.empty_packaging_qty,
                expected_empty_secondary_packaging_qty: item.empty_secondary_packaging_qty,
                quantity: item.quantity,
                empty_packaging_qty: item.empty_packaging_qty,
                empty_secondary_packaging_qty: item.empty_secondary_packaging_qty,
            })));
            setNotes('');
        }
    }, [open, transfer]);

    const handleItemChange = (index, field, value) => {
        const newItems = [...verifiedItems];
        newItems[index][field] = Number(value);
        setVerifiedItems(newItems);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const isPurePackaging = transfer.transfer_type === 'empty_packaging' &&
            transfer.stock_transfer_items?.every(item => (item.quantity || 0) === 0);
        
        if (isPurePackaging) {
            const packagingPayload = {
                notes: notes || null,
                items: verifiedItems.map(item => ({
                    id: item.id,
                    received_bottles: item.empty_packaging_qty,
                    received_crates: item.empty_secondary_packaging_qty,
                    broken_bottles: Math.max(0, (item.expected_empty_packaging_qty || 0) - item.empty_packaging_qty),
                    broken_crates: Math.max(0, (item.expected_empty_secondary_packaging_qty || 0) - item.empty_secondary_packaging_qty),
                    note: notes || ''
                }))
            };
            onConfirm(transfer.id, { data: packagingPayload, transferType: 'empty_packaging' });
        } else {
            // Pour les transferts mixtes (produits + emballages) ou seulement produits,
            // l'endpoint 'receive' gère les 3 types de quantités
            onConfirm(transfer.id, { data: { verifiedItems, notes }, transferType: 'regular' });
        }
    };

    if (!transfer) return null;

    const hasModifications = verifiedItems.some(item => 
        item.quantity !== item.expected_quantity ||
        item.empty_packaging_qty !== item.expected_empty_packaging_qty ||
        item.empty_secondary_packaging_qty !== item.expected_empty_secondary_packaging_qty
    );

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PackageCheck className="w-5 h-5 text-green-600" />
                        Vérification de la Réception : {transfer.reference}
                    </DialogTitle>
                    <DialogDescription>
                        Vérifiez les quantités reçues. Modifiez les chiffres s'il y a de la casse ou des manquants.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-4">
                        {verifiedItems.map((item, idx) => {
                            const isModified = 
                                item.quantity !== item.expected_quantity ||
                                item.empty_packaging_qty !== item.expected_empty_packaging_qty ||
                                item.empty_secondary_packaging_qty !== item.expected_empty_secondary_packaging_qty;
                            
                            return (
                                <div key={item.id} className={`p-4 rounded-xl border ${isModified ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="font-semibold text-gray-800">{item.product_name}</h4>
                                        {isModified && <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Modifié</span>}
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Produits (Attendu: {item.expected_quantity})</Label>
                                            <Input 
                                                type="number" min="0" max={item.expected_quantity}
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                className={`h-8 ${item.quantity !== item.expected_quantity ? 'border-amber-400' : ''}`}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Bout. Vides (Attendu: {item.expected_empty_packaging_qty})</Label>
                                            <Input 
                                                type="number" min="0" max={item.expected_empty_packaging_qty}
                                                value={item.empty_packaging_qty}
                                                onChange={(e) => handleItemChange(idx, 'empty_packaging_qty', e.target.value)}
                                                className={`h-8 ${item.empty_packaging_qty !== item.expected_empty_packaging_qty ? 'border-amber-400' : ''}`}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Casiers (Attendu: {item.expected_empty_secondary_packaging_qty})</Label>
                                            <Input 
                                                type="number" min="0" max={item.expected_empty_secondary_packaging_qty}
                                                value={item.empty_secondary_packaging_qty}
                                                onChange={(e) => handleItemChange(idx, 'empty_secondary_packaging_qty', e.target.value)}
                                                className={`h-8 ${item.empty_secondary_packaging_qty !== item.expected_empty_secondary_packaging_qty ? 'border-amber-400' : ''}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        <Label>Justification / Notes de réception {hasModifications && <span className="text-red-500">*</span>}</Label>
                        <Input 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                            placeholder="Ex: 2 bouteilles cassées en route..." 
                            required={hasModifications}
                            className={hasModifications && !notes ? 'border-red-400' : ''}
                        />
                        {hasModifications && !notes && <p className="text-xs text-red-500">Une justification est obligatoire car les quantités ont été modifiées.</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={isPending || (hasModifications && !notes)}>
                            {isPending ? 'Enregistrement...' : 'Confirmer la réception'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
