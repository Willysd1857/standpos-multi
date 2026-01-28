import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Banknote, Smartphone, CreditCard, Printer, Check, X, Utensils, Crown, User, Clock, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const paymentMethods = [
  { id: 'cash', name: 'Cash', icon: Banknote, color: 'bg-green-500', requiresRef: false },
  { id: 'mvola', name: 'MVola', icon: Smartphone, color: 'bg-yellow-500', requiresRef: true },
  { id: 'orange_money', name: 'Orange Money', icon: Smartphone, color: 'bg-orange-500', requiresRef: true },
  { id: 'airtel_money', name: 'Airtel Money', icon: Smartphone, color: 'bg-red-500', requiresRef: true },
  { id: 'visa', name: 'Visa/Carte', icon: CreditCard, color: 'bg-blue-600', requiresRef: true },
];

export default function PaymentModal({ open, onClose, items, total, onConfirm }) {
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [customerUnpaidCount, setCustomerUnpaidCount] = useState(0);
  const [isCustomerBlocked, setIsCustomerBlocked] = useState(false);

  // Fetch VIP charge from settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const vipCharge = Number(settings?.vip_charge) || 0;
  const totalWithVip = total + (isVip ? vipCharge : 0);
  const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedMethod);
  const requiresRef = selectedPaymentMethod?.requiresRef || false;

  // Generate customer ID
  const generateCustomerId = (name, phone) => {
    if (!name || !phone) return '';
    const cleanName = name.toUpperCase().replace(/\s+/g, '');
    const cleanPhone = phone.replace(/\s+/g, '');
    return `${cleanName}-${cleanPhone}`;
  };

  const customerId = generateCustomerId(customerName, phoneNumber);

  // Check customer credit when name and phone change
  React.useEffect(() => {
    const checkCustomerCredit = async () => {
      if (!customerId) {
        setCustomerUnpaidCount(0);
        setIsCustomerBlocked(false);
        return;
      }

      try {
        const res = await fetch(`http://localhost:3001/api/customers/${customerId}/unpaid-count`);
        if (res.ok) {
          const data = await res.json();
          setCustomerUnpaidCount(data.unpaid_count || 0);
          setIsCustomerBlocked(data.is_blocked || false);
        }
      } catch (error) {
        console.error('Error checking customer credit:', error);
      }
    };

    checkCustomerCredit();
  }, [customerId]);

  const handleConfirm = async (status = 'validated') => {
    // Validate transaction reference for methods that require it
    if (requiresRef && !transactionRef.trim()) {
      alert('Veuillez entrer la référence de transaction');
      return;
    }

    // Check customer credit limit FIRST if customer info is provided
    if (customerName && phoneNumber && isCustomerBlocked) {
      alert('❌ Ce client a atteint la limite de 3 additions impayées.\nVeuillez régler les dettes avant de continuer.');
      return;
    }

    const paidAmount = isPartialPayment ? Number(amountPaid) || 0 : totalWithVip;
    const dueAmount = totalWithVip - paidAmount;

    // Warn if customer has unpaid bills and is creating a new debt
    if (dueAmount > 0 && customerName && phoneNumber) {

      // Warn if customer has 2 unpaid bills
      if (customerUnpaidCount === 2) {
        const confirm = window.confirm(
          '⚠️ ATTENTION : Ce client a déjà 2 additions impayées.\n' +
          'Ceci sera sa dernière addition autorisée.\n\n' +
          'Continuer ?'
        );
        if (!confirm) return;
      }

      // Warn if customer has 1 unpaid bill
      if (customerUnpaidCount === 1) {
        const confirm = window.confirm(
          '⚠️ Ce client a déjà 1 addition impayée.\n' +
          'Continuer ?'
        );
        if (!confirm) return;
      }
    }

    setIsProcessing(true);

    let paymentStatus = 'paid';
    if (status === 'pending') {
      paymentStatus = 'unpaid';
    } else if (isPartialPayment) {
      if (paidAmount === 0) paymentStatus = 'unpaid';
      else if (dueAmount > 0) paymentStatus = 'partial';
    }

    await onConfirm({
      payment_method: selectedMethod,
      customer_name: customerName,
      phone_number: phoneNumber,
      table_number: tableNumber,
      transaction_ref: transactionRef || undefined,
      is_vip: isVip,
      print_receipt: printReceipt,
      amount_paid: status === 'pending' ? 0 : paidAmount,
      amount_due: status === 'pending' ? totalWithVip : dueAmount,
      payment_status: paymentStatus,
      status: status,
      customer_id: (dueAmount > 0 && customerId) ? customerId : undefined,
      created_date: customDate === new Date().toLocaleDateString('en-CA') ? undefined : new Date(customDate).toISOString()
    });
    setIsProcessing(false);
    setSelectedMethod('cash');
    setCustomerName('');
    setPhoneNumber('');
    setTableNumber('');
    setTransactionRef('');
    setIsVip(false);
    setIsPartialPayment(false);
    setAmountPaid('');
    setCustomDate(new Date().toLocaleDateString('en-CA'));
    setCustomerUnpaidCount(0);
    setIsCustomerBlocked(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-gradient-to-br from-gray-50 to-white max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            Finaliser la commande
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-3 overflow-y-auto flex-1">
          {/* Order summary */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-3 border border-blue-100">
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Récapitulatif ({items.length} article{items.length > 1 ? 's' : ''})
            </h4>
            <div className="space-y-1.5 max-h-20 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm bg-white/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-700 font-medium">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs mr-2">
                      {item.quantity}
                    </span>
                    {item.name}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {(item.price * item.quantity).toLocaleString()} Ar
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-blue-200 mt-2 pt-2 space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Sous-total</span>
                <span className="font-semibold text-gray-800">
                  {total.toLocaleString()} Ar
                </span>
              </div>
              {isVip && vipCharge > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-blue-600" />
                    Frais VIP
                  </span>
                  <span className="font-semibold text-blue-600">
                    +{vipCharge.toLocaleString()} Ar
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                <span className="font-semibold text-gray-700 text-sm">Total</span>
                <span className="text-xl font-bold text-blue-600">
                  {totalWithVip.toLocaleString()} Ar
                </span>
              </div>
            </div>
          </div>

          {/* Table, Customer, and Phone info */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Utensils className="w-3 h-3 text-blue-600" />
                Table
              </label>
              <Input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Ex: T5"
                className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <User className="w-3 h-3 text-blue-600" />
                Client
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom"
                className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-blue-600" />
                Tél.
              </label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="03x xx xxx xx"
                className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9 text-xs"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-600" />
                Date de la vente
              </label>
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9"
              />
            </div>
          </div>

          {/* Customer ID Display */}
          {customerId && (
            <div className={`rounded-xl p-3 border-2 ${isCustomerBlocked
              ? 'bg-red-50 border-red-300'
              : customerUnpaidCount >= 2
                ? 'bg-orange-50 border-orange-300'
                : customerUnpaidCount === 1
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-blue-50 border-blue-200'
              }`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-600">ID Client :</p>
                {isCustomerBlocked && (
                  <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                    🔒 BLOQUÉ
                  </span>
                )}
              </div>
              <p className="font-mono font-bold text-sm text-gray-800 mb-2">
                {customerId}
              </p>
              {customerUnpaidCount > 0 && (
                <div className={`text-xs font-semibold flex items-center gap-1 ${isCustomerBlocked
                  ? 'text-red-700'
                  : customerUnpaidCount >= 2
                    ? 'text-orange-700'
                    : 'text-yellow-700'
                  }`}>
                  ⚠️ {customerUnpaidCount} addition{customerUnpaidCount > 1 ? 's' : ''} impayée{customerUnpaidCount > 1 ? 's' : ''}
                  {isCustomerBlocked && ' - Paiement bloqué'}
                </div>
              )}
            </div>
          )}

          {/* VIP toggle */}
          <div className="flex items-center justify-between bg-blue-100 rounded-xl p-4 border-2 border-blue-400 shadow-md">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isVip ? 'bg-gradient-to-br from-blue-600 to-blue-500' : 'bg-gray-300'}`}>
                <Crown className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-800 text-sm">Table VIP</div>
                <p className="text-xs text-gray-500">Service prioritaire</p>
              </div>
            </div>
            <Switch
              checked={isVip}
              onCheckedChange={setIsVip}
              className="data-[state=unchecked]:bg-blue-300 data-[state=checked]:bg-blue-600 border-2 border-blue-200"
            />
          </div>

          {/* Partial Payment toggle */}
          <div className="bg-amber-100 rounded-xl p-4 border-2 border-amber-400 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isPartialPayment ? 'bg-gradient-to-br from-amber-600 to-orange-500' : 'bg-gray-300'}`}>
                  <Banknote className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Paiement partiel</div>
                  <p className="text-xs text-gray-500">Client paie une partie</p>
                </div>
              </div>
              <Switch
                checked={isPartialPayment}
                onCheckedChange={(checked) => {
                  setIsPartialPayment(checked);
                  if (!checked) setAmountPaid('');
                }}
                className="data-[state=unchecked]:bg-amber-300 data-[state=checked]:bg-amber-600 border-2 border-amber-200"
              />
            </div>

            {isPartialPayment && (
              <div className="space-y-2 pt-2 border-t border-amber-200">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Montant payé (Ar)
                  </label>
                  <Input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0"
                    className="rounded-xl border-gray-300 focus:border-amber-600 focus:ring-amber-500 h-9"
                  />
                </div>
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-600">Reste dû</span>
                  <span className="font-bold text-red-600">
                    {(totalWithVip - (Number(amountPaid) || 0)).toLocaleString()} Ar
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Payment methods */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">
              Mode de paiement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <motion.button
                  key={method.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedMethod(method.id);
                    if (!method.requiresRef) setTransactionRef('');
                  }}
                  className={`p-3 rounded-xl flex items-center gap-2 transition-all border-2 ${selectedMethod === method.id
                    ? `${method.color} text-white shadow-lg border-transparent`
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-md'
                    }`}
                >
                  <method.icon className="w-4 h-4" />
                  <span className="font-semibold text-xs">{method.name}</span>
                  {selectedMethod === method.id && (
                    <Check className="w-3 h-3 ml-auto" />
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Transaction Reference (for Mobile Money & Visa) */}
          {requiresRef && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200"
            >
              <label className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-blue-600" />
                Référence de transaction *
              </label>
              <Input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Ex: TXN123456789"
                className="rounded-xl border-blue-300 focus:border-blue-600 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Numéro de référence de la transaction</p>
            </motion.div>
          )}

          {/* Print receipt toggle */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Imprimer le ticket</span>
            </div>
            <Switch
              checked={printReceipt}
              onCheckedChange={setPrintReceipt}
            />
          </div>
        </div>

        {/* Action buttons - Fixed at bottom */}
        <div className="flex gap-3 pt-3 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl border-2 hover:bg-gray-50"
            disabled={isProcessing}
          >
            <X className="w-4 h-4 mr-2" />
            Annuler
          </Button>

          <Button
            onClick={() => handleConfirm('validated')}
            disabled={isProcessing || (isCustomerBlocked && (totalWithVip - (Number(amountPaid) || 0)) > 0)}
            className={`flex-[2] rounded-xl shadow-lg ${isCustomerBlocked && (totalWithVip - (Number(amountPaid) || 0)) > 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-green-500/30'
              } text-white`}
          >
            {isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : isCustomerBlocked && (totalWithVip - (Number(amountPaid) || 0)) > 0 ? (
              <>
                🔒 Client bloqué
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Confirmer le paiement
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog >
  );
}
