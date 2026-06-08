import React, { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote, Smartphone, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrency } from '@/contexts/CurrencyContext';

const paymentMethods = [
    { id: 'cash', name: 'Espèces', icon: Banknote, color: 'bg-green-500', requiresRef: false },
    { id: 'mvola', name: 'MVola', icon: Smartphone, color: 'bg-yellow-500', requiresRef: true },
    { id: 'orange_money', name: 'Orange Money', icon: Smartphone, color: 'bg-orange-500', requiresRef: true },
    { id: 'airtel_money', name: 'Airtel Money', icon: Smartphone, color: 'bg-red-500', requiresRef: true },
    { id: 'visa', name: 'Visa/Carte', icon: Smartphone, color: 'bg-blue-600', requiresRef: true },
];

export default function PayRemainingModal({ open, onClose, transaction, onConfirm }) {
    const { formatCurrency, getCurrencySymbol, convertAmount, convertToAriary } = useCurrency();
    const [selectedMethod, setSelectedMethod] = useState('cash');
    const [amountToPay, setAmountToPay] = useState(transaction ? convertAmount(transaction.amount_due) : 0);
    const [transactionRef, setTransactionRef] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedMethod);
    const requiresRef = selectedPaymentMethod?.requiresRef || false;

    const handleConfirm = async () => {
        if (!amountToPay || amountToPay <= 0) {
            toast.error('Veuillez entrer un montant valide');
            return;
        }

        const amountInAriary = convertToAriary(Number(amountToPay));

        if (amountInAriary > transaction.amount_due) {
            toast.error('Le montant ne peut pas dépasser le reste à payer');
            return;
        }

        if (requiresRef && !transactionRef.trim()) {
            toast.error('Veuillez entrer la référence de transaction');
            return;
        }

        setIsProcessing(true);
        await onConfirm({
            payment_method: selectedMethod,
            amount: amountInAriary,
            transaction_ref: transactionRef || undefined
        });
        setIsProcessing(false);
        setAmountToPay(0);
        setTransactionRef('');
        setSelectedMethod('cash');
    };

    if (!transaction) return null;

    const remainingAfterPayment = transaction.amount_due - (Number(amountToPay) || 0);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-gradient-to-br from-gray-50 to-white">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Banknote className="w-6 h-6 text-green-600" />
                        Payer le reste
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Transaction info */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Référence</span>
                                <span className="font-mono font-semibold">{transaction.reference}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Client</span>
                                <span className="font-medium">{transaction.partner_name || '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-blue-200">
                                <span className="text-gray-600">Total facture</span>
                                <span className="font-semibold">{formatCurrency(transaction.total_amount)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Déjà payé</span>
                                <span className="font-semibold text-green-600">{formatCurrency(transaction.amount_paid)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-blue-200">
                                <span className="font-semibold text-gray-700">Reste à payer</span>
                                <span className="text-lg font-bold text-red-600">{formatCurrency(transaction.amount_due)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Amount to pay */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 mb-2 block">
                            Montant à payer ({getCurrencySymbol()})
                        </label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={amountToPay}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                setAmountToPay(val);
                            }}
                            onWheel={(e) => e.target.blur()}
                            placeholder="0"
                            className="rounded-xl border-gray-300 focus:border-green-600 focus:ring-green-500"
                        />
                        <div className="flex gap-2 mt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAmountToPay(convertAmount(transaction.amount_due))}
                                className="flex-1 rounded-lg text-xs"
                            >
                                Tout payer
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAmountToPay(convertAmount(transaction.amount_due) / 2)}
                                className="flex-1 rounded-lg text-xs"
                            >
                                50%
                            </Button>
                        </div>
                    </div>

                    {/* Remaining after payment */}
                    {remainingAfterPayment > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-amber-700">Reste après paiement</span>
                                <span className="font-bold text-amber-700">{formatCurrency(transaction.amount_due - convertToAriary(Number(amountToPay) || 0))}</span>
                            </div>
                        </div>
                    )}

                    {/* Payment methods */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 mb-2 block">
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

                    {/* Transaction Reference Input */}
                    {requiresRef && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-blue-50 rounded-xl p-4 border border-blue-100"
                        >
                            <label className="text-xs font-semibold text-gray-700 mb-2 block">
                                Référence de transaction *
                            </label>
                            <Input
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                placeholder="Ex: TXN123456789"
                                className="rounded-xl border-blue-200 focus:border-blue-600 focus:ring-blue-500"
                            />
                        </motion.div>
                    )}
                </div>

                {/* Action buttons */}
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
                        onClick={handleConfirm}
                        disabled={isProcessing || !amountToPay || amountToPay <= 0}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-green-500/30"
                    >
                        {isProcessing ? (
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                            />
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Confirmer
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
