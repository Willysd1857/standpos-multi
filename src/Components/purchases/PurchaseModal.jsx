import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package } from 'lucide-react';

export default function PurchaseModal({ open, onClose, product, onSubmit, isLoading }) {
    const [formData, setFormData] = useState({
        quantity: '',
        unit_price: '',
        supplier_name: '',
        payment_method: 'cash',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        status: 'validated'
    });

    useEffect(() => {
        if (product) {
            // Reset form when product changes
            setFormData({
                quantity: '',
                unit_price: product.cost_price || '',
                supplier_name: '',
                payment_method: 'cash',
                date: new Date().toISOString().split('T')[0],
                notes: '',
                status: 'validated'
            });
        }
    }, [product]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.quantity || !formData.unit_price) return;

        onSubmit({
            product_id: product.id,
            product_name: product.name,
            quantity: Number(formData.quantity),
            unit_price: Number(formData.unit_price),
            supplier_name: formData.supplier_name,
            payment_method: formData.payment_method,
            date: formData.date,
            notes: formData.notes,
            status: formData.status
        });
    };

    const totalAmount = formData.quantity && formData.unit_price
        ? Number(formData.quantity) * Number(formData.unit_price)
        : 0;

    if (!product) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-green-600" />
                        Approvisionner : {product.name}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {/* Product info */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">Stock actuel</span>
                            <span className="text-lg font-bold text-blue-600">{product.stock}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Stock minimum</span>
                            <span className="text-sm font-semibold text-gray-600">{product.min_stock}</span>
                        </div>
                    </div>

                    {/* Quantity and Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantité *</Label>
                            <Input
                                id="quantity"
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                placeholder="0"
                                required
                                min="0"
                                step="any"
                                className="text-lg font-semibold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unit_price">Prix Unitaire (Ar) *</Label>
                            <Input
                                id="unit_price"
                                type="number"
                                value={formData.unit_price}
                                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                                placeholder="0"
                                required
                                min="0"
                                className="text-lg font-semibold"
                            />
                        </div>
                    </div>

                    {/* Total amount */}
                    {totalAmount > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Montant Total</span>
                                <span className="text-2xl font-bold text-green-600">{totalAmount.toLocaleString()} Ar</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Nouveau stock : {product.stock + Number(formData.quantity || 0)}
                            </div>
                        </div>
                    )}

                    {/* Supplier */}
                    <div className="space-y-2">
                        <Label htmlFor="supplier_name">Fournisseur</Label>
                        <Input
                            id="supplier_name"
                            value={formData.supplier_name}
                            onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                            placeholder="Nom du fournisseur"
                        />
                    </div>

                    {/* Payment method and Date */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="payment_method">Mode de paiement</Label>
                            <Select
                                value={formData.payment_method}
                                onValueChange={(val) => setFormData({ ...formData, payment_method: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="mvola">MVola</SelectItem>
                                    <SelectItem value="orange_money">Orange Money</SelectItem>
                                    <SelectItem value="airtel_money">Airtel Money</SelectItem>
                                    <SelectItem value="visa">Visa/Carte</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <Label htmlFor="status">Statut</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(val) => setFormData({ ...formData, status: val })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="validated">Validé</SelectItem>
                                <SelectItem value="pending">En attente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Notes additionnelles..."
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
