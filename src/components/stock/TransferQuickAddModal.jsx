import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package } from 'lucide-react';

export default function TransferQuickAddModal({ open, onClose, product, onAdd }) {
    const [quantity, setQuantity] = useState('');
    const [emptyPackagingQty, setEmptyPackagingQty] = useState('');
    const [emptySecondaryPackagingQty, setEmptySecondaryPackagingQty] = useState('');

    useEffect(() => {
        if (open) {
            setQuantity('');
            setEmptyPackagingQty('');
            setEmptySecondaryPackagingQty('');
        }
    }, [open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd({
            product_id: product.id,
            product_name: product.name,
            quantity: Number(quantity) || 0,
            empty_packaging_qty: Number(emptyPackagingQty) || 0,
            empty_secondary_packaging_qty: Number(emptySecondaryPackagingQty) || 0,
        });
        onClose();
    };

    if (!product) return null;

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-violet-600" />
                        Transférer {product.name}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Quantité (Produits pleins)</Label>
                        <Input 
                            type="number" 
                            min="0"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="0"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Bouteilles vides</Label>
                        <Input 
                            type="number" 
                            min="0"
                            value={emptyPackagingQty}
                            onChange={(e) => setEmptyPackagingQty(e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Cageots/Casiers vides</Label>
                        <Input 
                            type="number" 
                            min="0"
                            value={emptySecondaryPackagingQty}
                            onChange={(e) => setEmptySecondaryPackagingQty(e.target.value)}
                            placeholder="0"
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
                        <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white">
                            Ajouter au transfert
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
