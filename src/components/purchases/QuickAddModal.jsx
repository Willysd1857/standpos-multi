import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function QuickAddModal({ open, onClose, product, onAdd }) {
    const { formatCurrency, getCurrencySymbol } = useCurrency();
    const [quantity, setQuantity] = useState('');
    const [unitPrice, setUnitPrice] = useState('');

    useEffect(() => {
        if (product) {
            setUnitPrice(product.cost_price || '');
        }
    }, [product]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!quantity || !unitPrice) return;

        onAdd({
            product_id: product.id,
            product_name: product.name,
            unit: product.unit,
            quantity: Number(quantity),
            unit_price: Number(unitPrice),
            total: Number(quantity) * Number(unitPrice)
        });

        // Reset and close
        setQuantity('');
        onClose();
    };

    const total = quantity && unitPrice ? Number(quantity) * Number(unitPrice) : 0;

    if (!product) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px] bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-green-600" />
                        Ajouter au panier
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {/* Product info */}
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                        <div className="font-semibold text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-600">Stock actuel: {product.stock} {product.unit}</div>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Quantité ({product.unit}) *</Label>
                        <Input
                            id="quantity"
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="0"
                            required
                            min="0"
                            step="any"
                            autoFocus
                            className="text-lg font-semibold"
                        />
                    </div>

                    {/* Unit price */}
                    <div className="space-y-2">
                        <Label htmlFor="unit_price">Prix unitaire ({getCurrencySymbol()}) *</Label>
                        <Input
                            id="unit_price"
                            type="number"
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)}
                            placeholder="0"
                            required
                            min="0"
                            className="text-lg font-semibold"
                        />
                    </div>

                    {/* Total */}
                    {total > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Total</span>
                                <span className="text-xl font-bold text-green-600">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
                            Annuler
                        </Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white rounded-xl">
                            Ajouter au panier
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
