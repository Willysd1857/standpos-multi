import React, { useState, useMemo } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Banknote, Smartphone, CreditCard, Printer, Check, X, Utensils, Crown, User, Clock, Calendar, Package, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const paymentMethods = [
  { id: 'cash', name: 'Cash', icon: Banknote, color: 'bg-green-500', requiresRef: false },
  { id: 'mvola', name: 'MVola', icon: Smartphone, color: 'bg-yellow-500', requiresRef: true },
  { id: 'orange_money', name: 'Orange Money', icon: Smartphone, color: 'bg-orange-500', requiresRef: true },
  { id: 'airtel_money', name: 'Airtel Money', icon: Smartphone, color: 'bg-red-500', requiresRef: true },
  { id: 'visa', name: 'Visa/Carte', icon: CreditCard, color: 'bg-blue-600', requiresRef: true },
];

export default function PaymentModal({ open, onClose, items, total, onConfirm, initialTableNumber, initialIsVip, initialCustomerName = '', initialPhoneNumber = '' }) {
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [customerName, setCustomerName] = useState(initialCustomerName || '');
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber || '');
  const [isValidating, setIsValidating] = useState(false);
  const [tableNumber, setTableNumber] = useState(initialTableNumber || '');
  const [transactionRef, setTransactionRef] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [includeConsignment, setIncludeConsignment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [customerUnpaidCount, setCustomerUnpaidCount] = useState(0);
  const [isCustomerBlocked, setIsCustomerBlocked] = useState(false);
  const [isFullDebt, setIsFullDebt] = useState(false);
  const [amountGiven, setAmountGiven] = useState('');
  const [returnedPackaging, setReturnedPackaging] = useState({});

  // Currency context
  const { formatCurrency, getCurrencySymbol, convertToAriary, convertAmount } = useCurrency();
  const { enableTables } = useAppSettings();

  // Sync table number and VIP status when active order changes
  React.useEffect(() => {
    if (open) {
      setTableNumber(initialTableNumber || '');
      setIsVip(!!initialIsVip);
      setCustomerName(initialCustomerName || '');
      setPhoneNumber(initialPhoneNumber || '');

      // Reset other states
      setAmountPaid('');
      setAmountGiven('');
      setIsFullDebt(false);
      setIsPartialPayment(false);
      setTransactionRef('');
      setIncludeConsignment(false); // Default to unchecked

      const initialReturns = {};
      items.forEach(item => {
        if (item.has_packaging) {
            const bpc = Number(item.bottles_per_crate) || 24;
            const totalCrates = Math.floor(item.quantity / bpc);
            // Default: if unchecked, all are returned
            initialReturns[item.id] = { 
                bottles: item.quantity, 
                crates: totalCrates 
            };
        }
      });
      setReturnedPackaging(initialReturns);
    }
  }, [items, initialTableNumber, initialIsVip, initialCustomerName, initialPhoneNumber, open]);

  // Fetch VIP charge from settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const hasConsignmentItems = useMemo(() => items.some(item => item.has_packaging), [items]);

  const consignmentTotal = useMemo(() => {
    if (!includeConsignment) return 0;
    let sum = 0;
    items.forEach(item => {
      if (item.has_packaging) {
        const ret = returnedPackaging[item.id] || { bottles: 0, crates: 0 };
        const netBottles = Math.max(0, item.quantity - (ret.bottles || 0));
        
        const bpc = Number(item.bottles_per_crate) || 24;
        const totalCrates = Math.floor(item.quantity / bpc);
        const netCrates = Math.max(0, totalCrates - (ret.crates || 0));

        sum += (Number(item.bottle_deposit_price) || 0) * netBottles;
        sum += (Number(item.crate_deposit_price) || 0) * netCrates;
      }
    });
    return sum;
  }, [items, includeConsignment, returnedPackaging]);

  const vipCharge = Number(settings?.vip_charge) || 0;
  const totalWithVip = total + (isVip ? vipCharge : 0) + consignmentTotal;
  const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedMethod);
  const requiresRef = selectedPaymentMethod?.requiresRef || false;

  // Calculate payment amounts in Ariary for logic
  const paidAmountInAriary = useMemo(() => {
    if (isFullDebt) return 0;
    if (isPartialPayment) return convertToAriary(Number(amountPaid) || 0);
    return totalWithVip;
  }, [isFullDebt, isPartialPayment, amountPaid, totalWithVip, convertToAriary]);

  const dueAmountInAriary = useMemo(() => {
    return Math.max(0, totalWithVip - paidAmountInAriary);
  }, [totalWithVip, paidAmountInAriary]);

  // Calculate change to return
  const changeToReturn = useMemo(() => {
    // Convert given amount (in display currency) back to Ariary for calculation
    const givenInAriary = convertToAriary(Number(amountGiven) || 0);
    if (givenInAriary === 0) return 0;
    return givenInAriary - totalWithVip;
  }, [amountGiven, totalWithVip, convertToAriary]);

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
        setIsValidating(false);
        return;
      }

      setIsValidating(true);
      try {
        const res = await fetch(`/api/customers/${customerId}/unpaid-count`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          setCustomerUnpaidCount(data.unpaid_count || 0);
          setIsCustomerBlocked(data.is_blocked || false);

          if (data.is_blocked) {
            toast.error(`⚠️ CLIENT BLOQUÉ : ${customerId} a trop de dettes.`);
          }
        }
      } catch (error) {
        console.error('Error checking customer credit:', error);
      } finally {
        setIsValidating(false);
      }
    };

    const timer = setTimeout(checkCustomerCredit, 300); // Debounce
    return () => clearTimeout(timer);
  }, [customerId]);

  const handleConfirm = async (status = 'validated') => {
    // Validate transaction reference for methods that require it
    if (requiresRef && !transactionRef.trim()) {
      toast.error('Veuillez entrer la référence de transaction');
      return;
    }

    // Use the pre-calculated memoized values
    // paidAmountInAriary and dueAmountInAriary are already defined via useMemo

    // DEBT BLOCKING LOGIC
    // Block customers with 3+ unpaid debts from making NEW purchases
    if (customerName && phoneNumber && customerUnpaidCount >= 3) {
      toast.error('❌ CLIENT BLOQUÉ : Ce client a déjà ' + customerUnpaidCount + ' additions impayées.\nImpossible de faire un nouvel achat.\n\nVeuillez régler les dettes existantes dans l\'onglet Transactions avant de continuer.');
      return;
    }

    // Actual payment execution logic moved to a helper
    const executePayment = async () => {
      setIsProcessing(true);

      let paymentStatus = 'paid';
      if (status === 'pending') {
        paymentStatus = 'unpaid';
      } else if (isPartialPayment) {
        if (paidAmountInAriary === 0) paymentStatus = 'unpaid';
        else if (dueAmountInAriary > 0) paymentStatus = 'partial';
      }

      const paymentData = {
        customer_id: customerId,
        customer_name: customerName,
        phone_number: phoneNumber,
        amount_paid: paidAmountInAriary,
        amount_due: dueAmountInAriary,
        amount_given: Number(amountGiven) || 0,
        payment_method: selectedMethod,
        transaction_ref: transactionRef,
        payment_status: paymentStatus,
        is_vip: isVip,
        status: status,
        include_consignment: includeConsignment,
        consignment_total: consignmentTotal,
        returned_packaging: returnedPackaging,
        created_date: customDate ? new Date(customDate).toISOString() : new Date().toISOString()
      };

      try {
        await onConfirm(paymentData);
        onClose();
      } catch (error) {
        console.error('Payment error:', error);
        toast.error('Erreur lors du paiement: ' + error.message);
      } finally {
        setIsProcessing(false);
      }
    };

    // Warnings for customers with existing debts creating new debts
    if (customerName && phoneNumber && dueAmountInAriary > 0 && customerUnpaidCount > 0 && customerUnpaidCount < 3) {

      // Warn if customer has 2 unpaid bills and is creating a 3rd one
      if (customerUnpaidCount === 2 && dueAmountInAriary > 0) {
        toast('⚠️ ATTENTION : Ce client a déjà 2 additions impayées.', {
          description: 'Ceci sera sa DERNIÈRE addition à crédit autorisée.',
          action: {
            label: 'Continuer',
            onClick: () => executePayment()
          },
          duration: 10000
        });
        return;
      } else if (customerUnpaidCount > 0 && dueAmountInAriary > 0) {
        // General warning for any existing debt when adding more
        toast('⚠️ Dette(s) existante(s)', {
          description: 'Ce client a déjà ' + customerUnpaidCount + ' addition(s) impayée(s). Voulez-vous quand même enregistrer cette nouvelle dette ?',
          action: {
            label: 'Confirmer',
            onClick: () => executePayment()
          },
          duration: 8000
        });
        return;
      }
    }

    // No warning needed, execute immediately
    await executePayment();
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
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-blue-200 mt-2 pt-2 space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Sous-total</span>
                <span className="font-semibold text-gray-800">
                  {formatCurrency(total)}
                </span>
              </div>
              {enableTables && isVip && vipCharge > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-blue-600" />
                    Frais VIP
                  </span>
                  <span className="font-semibold text-blue-600">
                    +{formatCurrency(vipCharge)}
                  </span>
                </div>
              )}
              {includeConsignment && consignmentTotal > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Package className="w-3 h-3 text-orange-600" />
                    Consigne Emballages
                  </span>
                  <span className="font-semibold text-orange-600">
                    +{formatCurrency(consignmentTotal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                <span className="font-semibold text-gray-700 text-sm">Total</span>
                <span className="text-xl font-bold text-blue-600">
                  {formatCurrency(totalWithVip)}
                </span>
              </div>
            </div>
          </div>

          {/* Table, Customer, and Phone info */}
          <div className={`grid gap-2 ${enableTables ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {enableTables && (
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Utensils className="w-3 h-3 text-blue-600" />
                  Table
                </label>
                <Input
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value.toUpperCase())}
                  placeholder="Ex: T5"
                  className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9 text-xs uppercase"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <User className="w-3 h-3 text-blue-600" />
                Client
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value.toUpperCase())}
                placeholder="NOM"
                className="rounded-xl border-gray-300 focus:border-blue-600 focus:ring-blue-500 h-9 text-xs uppercase"
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

          {/* Credit Limit Alert */}
          {(isCustomerBlocked || customerUnpaidCount > 0) && (
            <div className={`rounded-xl p-3 border-l-4 shadow-sm ${isCustomerBlocked
              ? 'bg-red-50 border-red-500 text-red-700'
              : customerUnpaidCount >= 2
                ? 'bg-orange-50 border-orange-500 text-orange-700'
                : 'bg-yellow-50 border-yellow-500 text-yellow-800'
              }`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isCustomerBlocked ? (
                    <div className="bg-red-100 p-1.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div className={`${customerUnpaidCount >= 2 ? 'bg-orange-100' : 'bg-yellow-100'} p-1.5 rounded-full`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {isCustomerBlocked
                      ? 'CLIENT BLOQUÉ - Limite atteinte'
                      : customerUnpaidCount === 2
                        ? 'Attention : Dernière transaction autorisée'
                        : 'Information crédit'}
                  </h3>
                  <div className="mt-1 text-xs font-medium opacity-90">
                    <p>Ce client a {customerUnpaidCount} addition(s) impayée(s).</p>
                    {isCustomerBlocked && (
                      <p className="mt-1 font-bold underline">
                        Le paiement est verrouillé. Veuillez régulariser les dettes.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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
          {enableTables && (
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
          )}

          {/* Consignment toggle */}
          {hasConsignmentItems && (
            <div className="flex items-center justify-between bg-orange-50 rounded-xl p-4 border-2 border-orange-200 shadow-sm mt-3">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${includeConsignment ? 'bg-gradient-to-br from-orange-600 to-orange-500' : 'bg-gray-300'}`}>
                  <Package className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Consignation Emballages</div>
                  <p className="text-xs text-gray-500">Gérer les consignes et retours</p>
                </div>
              </div>
              <Switch
                checked={includeConsignment}
                onCheckedChange={(checked) => {
                  setIncludeConsignment(checked);
                  if (checked) {
                    // When checking consignment, set returns to 0
                    const zeros = {};
                    items.forEach(item => { if (item.has_packaging) zeros[item.id] = { bottles: 0, crates: 0 }; });
                    setReturnedPackaging(zeros);
                  } else {
                    // When unchecking, set returns to total
                    const maxes = {};
                    items.forEach(item => {
                      if (item.has_packaging) {
                        const bpc = Number(item.bottles_per_crate) || 24;
                        maxes[item.id] = { bottles: item.quantity, crates: Math.floor(item.quantity / bpc) };
                      }
                    });
                    setReturnedPackaging(maxes);
                  }
                }}
                className="data-[state=unchecked]:bg-orange-300 data-[state=checked]:bg-orange-600 border-2 border-orange-200"
              />
            </div>
          )}

          {/* Retour Emballages Section */}
          <AnimatePresence>
            {hasConsignmentItems && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-orange-50/50 rounded-xl p-3 border border-orange-100 mt-2 space-y-2 overflow-hidden"
              >
                <label className="text-xs font-semibold text-orange-800 mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />
                  Ajustement Retour d'Emballages
                </label>
                {items.filter(i => i.has_packaging).map(item => {
                  const bpc = Number(item.bottles_per_crate) || 24;
                  const totalCrates = Math.floor(item.quantity / bpc);
                  const maxBottles = item.quantity;
                  return (
                  <div key={item.id} className="flex flex-col bg-white p-2 rounded-lg text-sm border border-orange-100 gap-2">
                    <span className="text-gray-700 truncate font-semibold">{item.name} <span className="text-xs font-normal text-gray-500">(Acheté: {maxBottles} Btl / {totalCrates} Cag)</span></span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-500 shrink-0">Bouteilles:</span>
                        <Input 
                          type="number"
                          min="0"
                          max={maxBottles}
                          value={returnedPackaging[item.id]?.bottles ?? ''}
                          onChange={(e) => setReturnedPackaging({...returnedPackaging, [item.id]: { ...returnedPackaging[item.id], bottles: parseInt(e.target.value) || 0 }})}
                          className="h-8 rounded-lg border-gray-200 text-center"
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-500 shrink-0">Cageots:</span>
                        <Input 
                          type="number"
                          min="0"
                          max={totalCrates}
                          value={returnedPackaging[item.id]?.crates ?? ''}
                          onChange={(e) => setReturnedPackaging({...returnedPackaging, [item.id]: { ...returnedPackaging[item.id], crates: parseInt(e.target.value) || 0 }})}
                          className="h-8 rounded-lg border-gray-200 text-center"
                        />
                      </div>
                    </div>
                  </div>
                )})}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Debt & Partial Payment Options - Moved here */}
          <div className="space-y-3 mt-3">
            {/* Vente à crédit */}
            <div className="flex items-center justify-between bg-amber-100 rounded-xl p-4 border-2 border-amber-400 shadow-md">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isFullDebt ? 'bg-gradient-to-br from-amber-600 to-amber-500' : 'bg-gray-300'}`}>
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Vente à crédit</div>
                  <p className="text-xs text-gray-500">Le client ne paie rien aujourd'hui</p>
                </div>
              </div>
              <Switch
                checked={isFullDebt}
                onCheckedChange={(checked) => {
                  setIsFullDebt(checked);
                  if (checked) {
                    setIsPartialPayment(false);
                    setAmountPaid('');
                  }
                }}
                className="data-[state=unchecked]:bg-amber-300 data-[state=checked]:bg-amber-600 border-2 border-amber-200"
              />
            </div>

            {/* Paiement Partiel */}
            {!isFullDebt && (
              <div className="bg-emerald-100 rounded-xl p-4 border-2 border-emerald-400 shadow-md space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isPartialPayment ? 'bg-gradient-to-br from-emerald-600 to-emerald-500' : 'bg-gray-300'}`}>
                      <Banknote className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">Paiement partiel</div>
                      <p className="text-xs text-gray-500">Le client paie une partie seulement</p>
                    </div>
                  </div>
                  <Switch
                    checked={isPartialPayment}
                    onCheckedChange={(checked) => {
                      setIsPartialPayment(checked);
                      if (!checked) setAmountPaid('');
                      if (checked) setIsFullDebt(false);
                    }}
                    className="data-[state=unchecked]:bg-emerald-300 data-[state=checked]:bg-emerald-600 border-2 border-emerald-200"
                  />
                </div>

                <AnimatePresence>
                  {isPartialPayment && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 pt-2 border-t border-emerald-200"
                    >
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">
                          Montant payé ({getCurrencySymbol()})
                        </label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={amountPaid}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setAmountPaid(val);
                          }}
                          onWheel={(e) => e.target.blur()}
                          placeholder="0"
                          className="rounded-xl border-emerald-300 focus:border-emerald-600 focus:ring-emerald-500 h-9 bg-white"
                        />
                      </div>
                      <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg px-2.5 py-1.5">
                        <span className="text-gray-600">Reste dû</span>
                        <span className="font-bold text-red-600">
                          {formatCurrency(totalWithVip - convertToAriary(Number(amountPaid) || 0))}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Payment methods - hidden if full debt */}
          {!isFullDebt && (
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
          )}

          {/* Transaction Reference (for Mobile Money & Visa) - hidden if full debt */}
          {(requiresRef && !isFullDebt) && (
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



          {/* Change Calculator - Only show for full cash payments */}
          {!isPartialPayment && !isFullDebt && selectedMethod === 'cash' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-green-50 rounded-xl p-4 border-2 border-green-200 space-y-3"
            >
              <label className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Banknote className="w-4 h-4 text-green-600" />
                Montant donné par le client (optionnel)
              </label>
              <Input
                type="text"
                inputMode="decimal"
                value={amountGiven}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setAmountGiven(val);
                }}
                onWheel={(e) => e.target.blur()}
                placeholder={`Ex: ${Math.ceil(totalWithVip / 1000) * 1000}`}
                className="rounded-xl border-green-300 focus:border-green-600 focus:ring-green-500 text-lg font-semibold"
              />

              {/* Show change if amount given */}
              <AnimatePresence>
                {amountGiven && Number(amountGiven) > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-3 rounded-xl ${changeToReturn >= 0
                      ? 'bg-green-100 border-2 border-green-300'
                      : 'bg-red-100 border-2 border-red-300'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">
                        Reste à rendre :
                      </span>
                      <span className={`text-xl font-black ${changeToReturn >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                        {formatCurrency(Math.abs(changeToReturn))}
                      </span>
                    </div>
                    {changeToReturn < 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ Montant insuffisant ({formatCurrency(Math.abs(changeToReturn))} manquant)
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
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
            disabled={isProcessing || isValidating || (customerName && phoneNumber && (isCustomerBlocked || customerUnpaidCount >= 3))}
            className={`flex-[2] rounded-xl shadow-lg ${(customerName && phoneNumber && (isCustomerBlocked || customerUnpaidCount >= 3))
              ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30'
              : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-green-500/30'
              } text-white transition-all`}
          >
            {isProcessing || isValidating ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (customerName && phoneNumber && (isCustomerBlocked || customerUnpaidCount >= 3)) ? (
              <>
                <X className="w-4 h-4 mr-2" />
                Client Bloqué
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
