import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package } from 'lucide-react';

export default function CheckoutModal({ open, onClose, items, onConfirm, isLoading }) {
    const [formData, setFormData] = useState({
        supplier_name: '',
        payment_method: 'cash',
        date: new Date().toISOString().split('T')[0],
        status: 'validated',
        notes: ''
    });

    const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm({
            ...formData,
            items
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-green-600" />
                        Finaliser l'approvisionnement
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {/* Items summary */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Récapitulatif ({items.length} produit{items.length > 1 ? 's' : ''})
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {items.map((item) => (
                                <div key={item.product_id} className="flex justify-between text-sm bg-white/60 rounded-lg px-3 py-2">
                                    <span className="font-medium text-gray-900">
                                        {item.product_name} <span className="text-gray-500">x{item.quantity}</span>
                                    </span>
                                    <span className="font-semibold text-green-600">
                                        {(item.quantity * item.unit_price).toLocaleString()} Ar
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                            <span className="font-semibold text-gray-700">Total</span>
                            <span className="text-xl font-bold text-green-600">{total.toLocaleString()} Ar</span>
                        </div>
                    </div>

                    {/* Supplier */}
                    <div className="space-y-2">
                        <Label htmlFor="supplier_name">Fournisseur *</Label>
                        <Input
                            id="supplier_name"
                            value={formData.supplier_name}
                            onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                            placeholder="Nom du fournisseur"
                            required
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
                            {isLoading ? 'Enregistrement...' : 'Valider l\'approvisionnement'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
