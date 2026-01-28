import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAppDate } from '@/hooks/useAppDate';
import {
  Receipt, Search, Filter, Calendar, TrendingUp, TrendingDown,
  Eye, CheckCircle, XCircle, Clock, Banknote, Smartphone, DollarSign
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PayRemainingModal from '@/components/pos/PayRemainingModal';

const typeLabels = {
  vente: { label: 'Vente', color: 'bg-green-100 text-green-700', icon: TrendingUp },
  achat: { label: 'Achat', color: 'bg-blue-100 text-blue-700', icon: TrendingDown },
  reception: { label: 'Réception', color: 'bg-purple-100 text-purple-700', icon: TrendingUp },
  inventaire: { label: 'Inventaire', color: 'bg-blue-100 text-blue-700', icon: Receipt }
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
  airtel_money: { label: 'Airtel Money', icon: Smartphone }
};

export default function Transactions() {
  const { formatDate } = useAppDate();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [paymentTransaction, setPaymentTransaction] = useState(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list()
  });

  const queryClient = base44.queryClient || useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSelectedTransaction(null);
      alert('Transaction supprimée avec succès.');
    },
    onError: (error) => {
      console.error('Erreur lors de la suppression:', error);
      alert(`Erreur lors de la suppression: ${error.message}`);
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
        payment_method: paymentData.payment_method
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setPaymentTransaction(null);
      alert('Paiement enregistré avec succès!');
    },
    onError: (error) => {
      console.error('Error processing payment:', error);
      alert(`Erreur lors du traitement du paiement: ${error.message}`);
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
        t.partner_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [transactions, searchQuery, typeFilter, statusFilter]);

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
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette transaction ? Le stock sera restauré.')) {
      deleteMutation.mutate(id);
    }
  }, [deleteMutation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Receipt className="w-7 h-7 text-blue-600" />
            Historique des Transactions
          </h1>
          <p className="text-gray-500">Consultez l'historique de vos ventes et mouvements</p>
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
                <p className="text-2xl font-bold text-blue-600">{stats.todaySales.toLocaleString()} Ar</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Chiffre d'affaires</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalRevenue.toLocaleString()} Ar</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par référence ou client..."
              className="pl-10 rounded-xl"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 rounded-xl">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="vente">Vente</SelectItem>
              <SelectItem value="achat">Achat</SelectItem>
              <SelectItem value="reception">Réception</SelectItem>
              <SelectItem value="inventaire">Inventaire</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 rounded-xl">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="validated">Validé</SelectItem>
              {/* Removed Pending status */}
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold">Référence</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Client/Fournisseur</TableHead>
                  <TableHead className="font-semibold text-right">Montant</TableHead>
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
                        <TableCell>
                          <Badge className={`${typeInfo.color} border-0 flex items-center gap-1 w-fit`}>
                            <typeInfo.icon className="w-3 h-3" />
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {transaction.partner_name || '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-800">
                          {transaction.total_amount?.toLocaleString()} Ar
                        </TableCell>
                        <TableCell className="text-right">
                          {transaction.amount_due > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg font-semibold text-sm">
                              {transaction.amount_due.toLocaleString()} Ar
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
                  <div>
                    <p className="text-sm text-gray-500">Téléphone</p>
                    <p className="font-medium">{selectedTransaction.phone_number}</p>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold mb-3">Articles</h4>
                  <div className="space-y-2">
                    {selectedTransaction.items?.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="font-medium">{item.total?.toLocaleString()} Ar</span>
                      </div>
                    ))}
                  </div>

                  {/* Payment Breakdown */}
                  <div className="border-t border-gray-200 mt-3 pt-3 space-y-2">
                    {selectedTransaction.is_vip && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sous-total</span>
                          <span className="font-medium">
                            {(selectedTransaction.total_amount - (businessInfo?.vip_charge || 0)).toLocaleString()} Ar
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600 font-semibold">★ Frais Table VIP</span>
                          <span className="font-semibold text-amber-600">
                            +{businessInfo?.vip_charge?.toLocaleString()} Ar
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between pt-2 border-t border-gray-300">
                      <span className="font-semibold">Total</span>
                      <span className="text-xl font-bold text-blue-600">
                        {selectedTransaction.total_amount?.toLocaleString()} Ar
                      </span>
                    </div>

                    {selectedTransaction.amount_paid !== undefined && (
                      <>
                        <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                          <span className="text-gray-600">Montant payé</span>
                          <span className="font-medium text-green-600">
                            {selectedTransaction.amount_paid.toLocaleString()} Ar
                          </span>
                        </div>
                        {selectedTransaction.amount_due > 0 && (
                          <div className="flex justify-between text-sm bg-amber-50 p-2 rounded-lg">
                            <span className="font-semibold text-amber-700">Reste à payer</span>
                            <span className="font-bold text-amber-700">
                              {selectedTransaction.amount_due.toLocaleString()} Ar
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
      </div>
    </div>
  );
}