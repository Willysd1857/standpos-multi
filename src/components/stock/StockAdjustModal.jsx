import React, { useState } from 'react';
import { formatQuantity } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Package, TrendingUp, TrendingDown, ClipboardCheck, ChevronDown } from 'lucide-react';

export default function StockAdjustModal({ open, onClose, product, onConfirm }) {
  const [adjustType, setAdjustType] = useState('reception');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);

  const handleConfirm = async () => {
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) return;

    setIsProcessing(true);
    try {
      await onConfirm({
        type: adjustType,
        quantity: qty,
        notes
      });
      setQuantity('');
      setNotes('');
      setAdjustType('reception');
    } catch {
      // error toast handled by parent mutation onError
    } finally {
      setIsProcessing(false);
    }
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
              Stock actuel: <span className="font-bold text-gray-800">{formatQuantity(product.stock, product.unit)}</span> {product.unit}
            </p>
          </div>

          {/* Adjustment type */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              Type d'ajustement
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTypeMenuOpen(!isTypeMenuOpen)}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-center gap-2">
                  {(() => {
                    const selected = adjustTypes.find(t => t.id === adjustType);
                    const Icon = selected.icon;
                    return (
                      <>
                        <Icon className={`w-4 h-4 ${selected.color}`} />
                        <span>{selected.label}</span>
                      </>
                    );
                  })()}
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {isTypeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setIsTypeMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-[70] mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg overflow-hidden">
                    {adjustTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setAdjustType(type.id);
                            setIsTypeMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${adjustType === type.id ? 'bg-orange-50 text-orange-700 font-medium' : 'hover:bg-gray-50'}`}
                        >
                          <Icon className={`w-4 h-4 ${type.color}`} />
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              {adjustType === 'ajustement' ? 'Nouveau stock' : 'Quantité à ajouter'}
            </Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={adjustType === 'ajustement' ? 'Ex: 50' : 'Ex: 10'}
              className="rounded-xl"
            />
            {adjustType !== 'ajustement' && quantity && (
              <p className="text-xs text-gray-500 mt-1">
                Nouveau stock: <span className="font-bold">{formatQuantity((product.stock || 0) + Number(quantity), product.unit)}</span> {product.unit}
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