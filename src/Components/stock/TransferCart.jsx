import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Truck, Send, Trash2, X, Plus, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function TransferCart({ items, onUpdateItem, onRemoveItem, onClear, onCheckout, locations, user, isLoading }) {
    const [showCheckout, setShowCheckout] = useState(false);
    const [fromLocationId, setFromLocationId] = useState('');
    const [toLocationId, setToLocationId] = useState('');
    const [notes, setNotes] = useState('');

    const handleConfirm = (e) => {
        e.preventDefault();
        onCheckout({
            from_location_id: fromLocationId,
            to_location_id: toLocationId,
            notes,
            items
        });
        setShowCheckout(false);
        setNotes('');
        setFromLocationId('');
        setToLocationId('');
    };

    return (
        <Card className="h-full flex flex-col border-0 shadow-xl bg-white/80 backdrop-blur-xl">
            <CardHeader className="border-b border-gray-100 bg-white/50 pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-violet-900">
                        <Truck className="w-5 h-5 text-violet-600" />
                        Transfert en cours
                    </CardTitle>
                    {items.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={onClear} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2">
                            <Trash2 className="w-4 h-4 mr-1" /> Vider
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                    {items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <Truck className="w-16 h-16 mb-4 opacity-20" />
                            <p>Sélectionnez des produits pour préparer un transfert</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {items.map((item, index) => (
                                <div key={`${item.product_id}-${index}`} className="flex flex-col gap-2 p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-violet-200 transition-colors group">
                                    <div className="flex justify-between items-start">
                                        <div className="font-semibold text-gray-800 text-sm line-clamp-2">{item.product_name}</div>
                                        <button onClick={() => onRemoveItem(item.product_id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-gray-500 uppercase">Produits</Label>
                                            <Input type="number" min="0" value={item.quantity} onChange={(e) => onUpdateItem(item.product_id, { quantity: Number(e.target.value) })} className="h-7 text-xs px-2" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-gray-500 uppercase">Bout. Vides</Label>
                                            <Input type="number" min="0" value={item.empty_packaging_qty} onChange={(e) => onUpdateItem(item.product_id, { empty_packaging_qty: Number(e.target.value) })} className="h-7 text-xs px-2" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-gray-500 uppercase">Casiers</Label>
                                            <Input type="number" min="0" value={item.empty_secondary_packaging_qty} onChange={(e) => onUpdateItem(item.product_id, { empty_secondary_packaging_qty: Number(e.target.value) })} className="h-7 text-xs px-2" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            <CardFooter className="border-t border-gray-100 bg-gray-50/50 p-4">
                <Button 
                    className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-lg shadow-violet-200 transition-all font-semibold text-base"
                    disabled={items.length === 0 || isLoading}
                    onClick={() => setShowCheckout(true)}
                >
                    <Send className="w-5 h-5 mr-2" />
                    Valider le Transfert
                </Button>
            </CardFooter>

            <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-violet-600" />
                            Finaliser le Transfert
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleConfirm} className="space-y-4 py-4">
                        {user?.role === 'admin' && !user?.location_id && (
                            <div className="space-y-2">
                                <Label>Origine (Admin) *</Label>
                                <select 
                                    value={fromLocationId} 
                                    onChange={e => setFromLocationId(e.target.value)}
                                    className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" 
                                    required
                                >
                                    <option value="">Choisir l'origine...</option>
                                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Destination *</Label>
                            <select 
                                value={toLocationId} 
                                onChange={e => setToLocationId(e.target.value)}
                                className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" 
                                required
                            >
                                <option value="">Choisir un emplacement...</option>
                                {locations.filter(l => l.id !== (user?.location_id || fromLocationId)).map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label>Notes (Optionnel)</Label>
                            <Input 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)} 
                                placeholder="Transporteur, motif..."
                            />
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setShowCheckout(false)}>Annuler</Button>
                            <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white" disabled={isLoading}>
                                Expédier
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
