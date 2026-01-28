import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, TrendingUp, TrendingDown, ClipboardCheck } from 'lucide-react';

export default function StockAdjustModal({ open, onClose, product, onConfirm }) {
  const [adjustType, setAdjustType] = useState('reception');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    if (!quantity || isNaN(Number(quantity))) return;
    
    setIsProcessing(true);
    await onConfirm({
      type: adjustType,
      quantity: Number(quantity),
      notes
    });
    setIsProcessing(false);
    setQuantity('');
    setNotes('');
    setAdjustType('reception');
  };

  if (!product) return null;

  const adjustTypes = [
    { id: 'reception', label: 'Réception / Achat', icon: TrendingUp, color: 'text-green-600' },
    { id: 'ajustement', label: 'Ajustement manuel', icon: ClipboardCheck, color: 'text-blue-600' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            Ajuster le stock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-800">{product.name}</h4>
            <p className="text-sm text-gray-500">
              Stock actuel: <span className="font-bold text-gray-800">{product.stock || 0}</span> unités
            </p>
          </div>

          {/* Adjustment type */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              Type d'ajustement
            </Label>
            <Select value={adjustType} onValueChange={setAdjustType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adjustTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    <div className="flex items-center gap-2">
                      <type.icon className={`w-4 h-4 ${type.color}`} />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              {adjustType === 'ajustement' ? 'Nouveau stock' : 'Quantité à ajouter'}
            </Label>
            <Input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={adjustType === 'ajustement' ? 'Ex: 50' : 'Ex: 10'}
              className="rounded-xl"
            />
            {adjustType !== 'ajustement' && quantity && (
              <p className="text-xs text-gray-500 mt-1">
                Nouveau stock: <span className="font-bold">{(product.stock || 0) + Number(quantity)}</span>
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              Notes (optionnel)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Raison de l'ajustement..."
              className="rounded-xl resize-none"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl"
              disabled={isProcessing}
            >
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!quantity || isProcessing}
              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl"
            >
              {isProcessing ? 'Traitement...' : 'Confirmer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}