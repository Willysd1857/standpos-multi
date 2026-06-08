import React, { useState, useMemo, useCallback } from 'react';
import { formatAmount } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAppDate } from '@/hooks/useAppDate';
import { toast } from 'sonner';
import {
  Receipt, Search, Filter, Calendar, TrendingUp, TrendingDown,
  Eye, CheckCircle, XCircle, Clock, Banknote, Smartphone, DollarSign, CreditCard, RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PayRemainingModal from '@/components/pos/PayRemainingModal';
import ReceiptModal from '@/components/pos/ReceiptModal';

const typeLabels = {
  vente: { label: 'Vente', color: 'bg-green-100 text-green-700', icon: TrendingUp },
  achat: { label: 'Achat', color: 'bg-blue-100 text-blue-700', icon: TrendingDown },
  reception: { label: 'Réception', color: 'bg-purple-100 text-purple-700', icon: TrendingUp },
  inventaire: { label: 'Inventaire', color: 'bg-blue-100 text-blue-700', icon: Receipt },
  reglement: { label: 'Règlement Dette', color: 'bg-amber-100 text-amber-700', icon: Banknote }
};

const statusLabels = {
  validated: { label: 'Validé', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'Annulé', color: 'bg-red-100 text-red-700', icon: XCircle },
  pending: { label: 'En attente', color: 'bg-blue-100 text-blue-700', icon: Clock }
};

const paymentLabels = {
  cash: { label: 'Espèces', icon: Banknote },
  mvola: { label: 'MVola', icon: Smartphone },
  orange_money: { label: 'Orange Money', icon: Smartphone },
  airtel_money: { label: 'Airtel Money', icon: Smartphone },
  visa: { label: 'Visa/Carte', icon: CreditCard }
};

export default function Transactions() {
  const { formatDate } = useAppDate();
  const { formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [paymentTransaction, setPaymentTransaction] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransactionForReceipt, setLastTransactionForReceipt] = useState(null);
  const [onlyDebts, setOnlyDebts] = useState(false);

  const { data: transactions = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list()
  });

  const queryClient = base44.queryClient || useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['transactions'] });

      // Snapshot previous value for rollback
      const previousTransactions = queryClient.getQueryData(['transactions']);

      // Optimistically update: remove from UI immediately
      queryClient.setQueryData(['transactions'], (old) =>
        old ? old.filter(t => t.id !== id) : []
      );

      return { previousTransactions };
    },
    onError: (err, id, context) => {
      // Rollback on error
      queryClient.setQueryData(['transactions'], context.previousTransactions);
      console.error('Erreur lors de la suppression:', err);
      toast.error(`Erreur lors de la suppression: ${err.message}`);
    },
    onSuccess: () => {
      setSelectedTransaction(null);
      toast.success('Transaction supprimée avec succès');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const payRemainingMutation = useMutation({
    mutationFn: async ({ transactionId, paymentData }) => {
      const transaction = transactions.find(t => t.id === transactionId);
      const newAmountPaid = (transaction.amount_paid || 0) + paymentData.amount;
      const newAmountDue = transaction.amount_due - paymentData.amount;

      // Fixed: Using dedicated payment route to avoid stock issues
      return base44.entities.Transaction.updatePayment(transactionId, {
        amount_paid: newAmountPaid,
        amount_due: Math.max(0, newAmountDue),
        payment_status: newAmountDue <= 0 ? 'paid' : 'partial',
        payment_method: paymentData.payment_method,
        transaction_ref: paymentData.transaction_ref
      });
    },
    onSuccess: (updatedTransaction, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setPaymentTransaction(null);
      // Attach the specific amount paid now for the receipt display
      setLastTransactionForReceipt({
        ...updatedTransaction,
        paid_now: variables.paymentData.amount,
        is_debt_settlement: true
      });
      setShowReceipt(true);
    },
    onError: (error) => {
      console.error('Error processing payment:', error);
      toast.error(`Erreur lors du traitement du paiement: ${error.message}`);
    }
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const businessInfo = settings || {};

  // Memoized filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = !searchQuery ||
        t.reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.partner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.customer_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = t.type === 'vente' || t.type === 'reglement';
      const matchesDebt = !onlyDebts || (t.amount_due > 0 && t.status === 'validated');
      return matchesSearch && matchesType && matchesDebt;
    });
  }, [transactions, searchQuery, onlyDebts]);

  // Memoized stats
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: transactions.length,
      sales: transactions.filter(t => t.type === 'vente' && t.status === 'validated').length,
      totalRevenue: transactions
        .filter(t => t.type === 'vente' && t.status === 'validated')
        .reduce((sum, t) => sum + (t.total_amount || 0), 0),
      todaySales: transactions
        .filter(t => {
          return t.type === 'vente' &&
            t.status === 'validated' &&
            new Date(t.created_date).toDateString() === today;
        })
        .reduce((sum, t) => sum + (t.total_amount || 0), 0)
    };
  }, [transactions]);

  // Memoized handlers
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleDelete = useCallback((id) => {
    toast('Êtes-vous sûr de vouloir supprimer cette transaction ?', {
      description: 'Le stock sera restauré.',
      action: {
        label: 'Supprimer',
        onClick: () => deleteMutation.mutate(id)
      }
    });
  }, [deleteMutation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Receipt className="w-7 h-7 text-blue-600" />
              Historique des Transactions
            </h1>
            <p className="text-gray-500">Consultez l'historique de vos ventes et mouvements</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="rounded-xl bg-white shadow-sm hover:shadow-md transition-all gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoading || isRefetching) ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Total transactions</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Ventes validées</p>
                <p className="text-2xl font-bold text-green-600">{stats.sales}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Ventes du jour</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.todaySales)}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Chiffre d'affaires</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalRevenue)}</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par référence ou client..."
              className="pl-10 rounded-xl"
            />
          </div>


          <Button
            variant={onlyDebts ? "destructive" : "outline"}
            onClick={() => setOnlyDebts(!onlyDebts)}
            className={`rounded-xl flex items-center gap-2 transition-all duration-300 ${onlyDebts ? 'shadow-lg shadow-red-500/20' : 'hover:border-blue-300 hover:text-blue-600'}`}
          >
            <Banknote className={`w-4 h-4 ${onlyDebts ? 'animate-pulse' : ''}`} />
            {onlyDebts ? 'Afficher toutes les ventes' : 'Ventes avec dettes seulement'}
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold">Référence</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Client/Fournisseur</TableHead>
                  <TableHead className="font-semibold">ID Client</TableHead>
                  <TableHead className="font-semibold text-right">Montant Payé</TableHead>
                  <TableHead className="font-semibold text-right">Reste à payer</TableHead>
                  <TableHead className="font-semibold">Paiement</TableHead>
                  <TableHead className="font-semibold">Statut</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}>
                        <div className="h-12 bg-gray-100 rounded animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                      Aucune transaction trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction, index) => {
                    const typeInfo = typeLabels[transaction.type] || typeLabels.vente;
                    const statusInfo = statusLabels[transaction.status] || statusLabels.pending;
                    const paymentInfo = paymentLabels[transaction.payment_method];
                    const hasUnpaid = transaction.amount_due > 0;

                    return (
                      <TableRow
                        key={transaction.id}
                        className={`hover:bg-gray-50/50 transition-colors ${hasUnpaid ? 'bg-amber-50/30' : ''}`}
                      >
                        <TableCell className="font-mono font-medium text-gray-800">
                          {transaction.reference}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(transaction.created_date)}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {transaction.partner_name || '-'}
                        </TableCell>
                        <TableCell className="font-mono font-medium text-gray-800 uppercase">
                          {transaction.customer_id || (transaction.partner_name && transaction.phone_number ? `${transaction.partner_name.toUpperCase().replace(/\s+/g, '')}-${transaction.phone_number.replace(/\s+/g, '')}` : '-')}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-700">
                          {formatCurrency(transaction.amount_paid || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {transaction.amount_due > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg font-semibold text-sm">
                              {formatCurrency(transaction.amount_due)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {paymentInfo && (
                            <div className="flex items-center gap-1 text-gray-600 text-sm">
                              <paymentInfo.icon className="w-3 h-3" />
                              {paymentInfo.label}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusInfo.color} border-0 flex items-center gap-1 w-fit`}>
                            <statusInfo.icon className="w-3 h-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {/* Removed pending buttons (Validate / Edit) */}
                            {hasUnpaid && transaction.status === 'validated' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPaymentTransaction(transaction)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Payer le reste"
                              >
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(transaction.id)}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              title="Supprimer la transaction"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedTransaction(transaction)}
                              className="text-gray-500 hover:text-blue-600"
                              title="Voir les détails"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Detail modal */}
        <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Détails de la transaction</DialogTitle>
            </DialogHeader>

            {selectedTransaction && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Référence</p>
                    <p className="font-mono font-semibold">{selectedTransaction.reference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">
                      {formatDate(selectedTransaction.created_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Type</p>
                    <Badge className={`${typeLabels[selectedTransaction.type]?.color} border-0`}>
                      {typeLabels[selectedTransaction.type]?.label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Statut</p>
                    <Badge className={`${statusLabels[selectedTransaction.status]?.color} border-0`}>
                      {statusLabels[selectedTransaction.status]?.label}
                    </Badge>
                  </div>
                </div>

                {selectedTransaction.partner_name && (
                  <div>
                    <p className="text-sm text-gray-500">Client/Fournisseur</p>
                    <p className="font-medium">{selectedTransaction.partner_name}</p>
                  </div>
                )}
                {selectedTransaction.phone_number && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Téléphone</p>
                      <p className="font-medium">{selectedTransaction.phone_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ID Client</p>
                      <p className="font-mono font-semibold uppercase">
                        {selectedTransaction.customer_id || (selectedTransaction.partner_name && selectedTransaction.phone_number ? `${selectedTransaction.partner_name.toUpperCase().replace(/\s+/g, '')}-${selectedTransaction.phone_number.replace(/\s+/g, '')}` : '-')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4">
                  {selectedTransaction.type === 'reglement' ? (
                    <div className="text-center py-2">
                      <Banknote className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                      <p className="font-bold text-gray-800">Règlement de dette</p>
                      <p className="text-xs text-gray-500 mt-1">Paiement enregistré pour une facture antérieure</p>
                    </div>
                  ) : (
                    <>
                      <h4 className="font-semibold mb-3">Articles</h4>
                      <div className="space-y-2">
                        {selectedTransaction.items?.map((item, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-600">
                              {Number(item.quantity).toFixed(2)}x {item.product_name}
                            </span>
                            <span className="font-medium">{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Payment Breakdown */}
                  <div className="border-t border-gray-200 mt-3 pt-3 space-y-2">
                    {selectedTransaction.is_vip && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sous-total</span>
                          <span className="font-medium">
                            {formatCurrency(selectedTransaction.total_amount - (businessInfo?.vip_charge || 0))}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600 font-semibold">★ Frais Table VIP</span>
                          <span className="font-semibold text-amber-600">
                            +{formatCurrency(businessInfo?.vip_charge || 0)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between pt-2 border-t border-gray-300">
                      <span className="font-semibold">
                        {selectedTransaction.type === 'reglement' ? 'Montant réglé' : 'Total'}
                      </span>
                      <span className="text-xl font-bold text-blue-600">
                        {selectedTransaction.type === 'reglement'
                          ? formatCurrency(selectedTransaction.amount_paid)
                          : formatCurrency(selectedTransaction.total_amount)}
                      </span>
                    </div>

                    {selectedTransaction.amount_paid !== undefined && selectedTransaction.type !== 'reglement' && (
                      <>
                        <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                          <span className="text-gray-600">Montant payé</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(Math.max(0, (selectedTransaction.total_amount - (selectedTransaction.amount_due || 0))))}
                          </span>
                        </div>
                        {selectedTransaction.amount_due > 0 && (
                          <div className="flex justify-between text-sm bg-amber-50 p-2 rounded-lg">
                            <span className="font-semibold text-amber-700">Reste à payer</span>
                            <span className="font-bold text-amber-700">
                              {formatCurrency(selectedTransaction.amount_due)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                          <span className="text-gray-500 italic">Mode de paiement :</span>
                          <span className="font-medium text-gray-700">
                            {paymentLabels[selectedTransaction.payment_method]?.label || selectedTransaction.payment_method}
                          </span>
                        </div>
                        {selectedTransaction.transaction_ref && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500 italic">Réf. Transaction :</span>
                            <span className="font-mono font-bold text-blue-600">
                              {selectedTransaction.transaction_ref}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {selectedTransaction.notes && (
                  <div>
                    <p className="text-sm text-gray-500">Notes</p>
                    <p className="text-gray-700">{selectedTransaction.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Pay remaining modal */}
        <PayRemainingModal
          open={!!paymentTransaction}
          onClose={() => setPaymentTransaction(null)}
          transaction={paymentTransaction}
          onConfirm={(paymentData) => {
            payRemainingMutation.mutate({
              transactionId: paymentTransaction.id,
              paymentData
            });
          }}
        />

        <ReceiptModal
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          transaction={lastTransactionForReceipt}
        />
      </div>
    </div>
  );
}