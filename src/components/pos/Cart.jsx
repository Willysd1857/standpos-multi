import React from 'react';
import { formatQuantity } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, Receipt, Crown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAppDate } from '@/hooks/useAppDate';

export default function Cart({ items, tableNumber, isVip, vipCharge, onUpdateQuantity, onRemove, onCheckout, onClear, onHold, isHolding }) {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal + (isVip ? vipCharge : 0);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const { formatDate } = useAppDate();
  const currentDate = formatDate(new Date(), 'dd/MM/yyyy HH:mm');

  // Currency context for formatting
  const { formatCurrency } = useCurrency();
  const { enableTables } = useAppSettings();

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-200 overflow-hidden">
      {/* Receipt Header - Business Info */}
      <div className="p-4 border-b-2 border-dashed border-gray-300 bg-gray-50">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex-1">
            <h3 className="font-bold text-sm text-gray-900 mb-1">
              {settings?.business_name || 'StandPOS'}
            </h3>
            {settings?.business_address && (
              <p className="text-xs text-gray-600 leading-tight">{settings.business_address}</p>
            )}
            {settings?.business_phone && (
              <p className="text-xs text-gray-600">Tél: {settings.business_phone}</p>
            )}
            {(settings?.nif || settings?.stat) && (
              <p className="text-xs text-gray-600">
                {settings.nif && `NIF: ${settings.nif}`}
                {settings.nif && settings.stat && ' • '}
                {settings.stat && `STAT: ${settings.stat}`}
              </p>
            )}
          </div>
          {settings?.business_logo && (
            <img
              src={settings.business_logo}
              alt="Logo"
              className="w-16 h-12 object-contain"
            />
          )}
        </div>

        {/* Receipt Info */}
        <div className="text-xs space-y-1 pt-2 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
              BROUILLON
            </span>
            <span className="text-gray-600">{currentDate}</span>
          </div>
          {enableTables && tableNumber && (
            <div className="flex justify-between">
              <span className="text-gray-600">Table:</span>
              <span className="font-bold text-gray-900">{tableNumber === 'VD' ? 'Vente Directe' : tableNumber}</span>
            </div>
          )}
          {enableTables && isVip && (
            <div className="text-center pt-1">
              <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-3 py-1 rounded text-xs font-bold shadow-sm">
                ★ TABLE VIP ★
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Items List - Receipt Style */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-300 px-6 text-center">
            <div className="w-24 h-24 mb-4 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-100">
              <svg className="w-12 h-12 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h3" />
                <path d="M12 9v2m0 0v2m0-2h-1m1 0h1" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-400">Panier vide</p>
            <p className="text-[11px] text-gray-400 mt-1 max-w-[150px]">Ajoutez des produits pour commencer</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-2 border-b border-gray-200 pb-1">
              Articles
            </div>
            {items.map((item) => (
              <div key={item.id} className="text-xs border-b border-gray-100 pb-2">
                {/* Product name */}
                <div className="font-bold text-gray-900 mb-1.5 flex justify-between items-start">
                  <span className="flex-1">{item.name}</span>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="text-red-400 hover:text-red-600 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quantity controls + price */}
                <div className="flex justify-between items-center pl-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center border border-gray-300"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center font-mono font-semibold">
                      {formatQuantity(item.quantity, item.unit)}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center border border-gray-300 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-gray-600 ml-1">
                      x {formatCurrency(item.price)}
                    </span>
                  </div>
                  <div className="font-bold text-gray-900">
                    {formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals Section */}
      {items.length > 0 && (
        <div className="p-4 border-t-2 border-dashed border-gray-300 bg-gray-50">
          {/* Subtotal (if VIP) */}
          {isVip && vipCharge > 0 && (
            <>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600">Sous-total</span>
                <span className="text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-orange-600 font-bold mb-2">
                <span>★ Frais Table VIP</span>
                <span>+{formatCurrency(vipCharge)}</span>
              </div>
            </>
          )}

          {/* Total */}
          <div className="border-t-2 border-gray-800 pt-2 mb-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm uppercase">Total</span>
              <span className="font-bold text-xl">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              onClick={onCheckout}
              disabled={items.length === 0}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl h-12 text-base font-bold shadow-lg"
            >
              <Receipt className="w-5 h-5 mr-2" />
              Payer {formatCurrency(total)}
            </Button>

            {enableTables && tableNumber && tableNumber !== 'VD' && (
              <Button
                onClick={onHold}
                disabled={isHolding || items.length === 0}
                variant="outline"
                className="w-full rounded-xl h-10 border-2 border-gray-300 hover:bg-gray-100"
              >
                {isHolding ? 'Enregistrement...' : 'Mettre en attente'}
              </Button>
            )}

            {items.length > 0 && (
              <Button
                onClick={onClear}
                variant="ghost"
                className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Vider le panier
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
