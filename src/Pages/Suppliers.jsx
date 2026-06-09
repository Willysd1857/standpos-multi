import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Search, Plus, Trash2, CreditCard, DollarSign,
  Phone, User, Package, RefreshCw, Eye, ArrowDownLeft,
  ChevronDown, X, CheckCircle2, AlertTriangle, Undo2, Calendar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, differenceInDays, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_BASE = '/api';
const getToken = () => localStorage.getItem('auth_token');

const fetchAPI = async (endpoint, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
};

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [newSupplier, setNewSupplier] = useState({ name: '', contact_info: '', phone: '' });
  const [payment, setPayment] = useState({ amount: '', payment_method: 'cash', notes: '' });

  // Fetch enriched suppliers (with packaging outstanding + due dates)
  const { data: suppliers = [], isLoading, refetch } = useQuery({
    queryKey: ['suppliers-enriched'],
    queryFn: () => fetchAPI('/suppliers/enriched'),
  });

  // Stats
  const stats = useMemo(() => {
    const totalDebt = suppliers.reduce((s, sup) => s + (parseFloat(sup.total_debt) || 0), 0);
    const active = suppliers.filter(s => s.is_active !== false).length;
    const withDebt = suppliers.filter(s => parseFloat(s.total_debt) > 0).length;
    return { totalDebt, active, withDebt };
  }, [suppliers]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.contact_info?.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (data) => fetchAPI('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers-enriched'] });
      setIsAddModalOpen(false);
      setNewSupplier({ name: '', contact_info: '', phone: '' });
      toast.success('Fournisseur ajouté');
    },
    onError: (e) => toast.error(e.message),
  });

  const payMut = useMutation({
    mutationFn: ({ id, data }) => fetchAPI(`/suppliers/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers-enriched'] });
      setIsPayModalOpen(false);
      setPayment({ amount: '', payment_method: 'cash', notes: '' });
      toast.success('Paiement enregistré');
    },
    onError: (e) => toast.error(e.message),
  });

  const openDetail = async (supplier) => {
    try {
      const detail = await fetchAPI(`/suppliers/${supplier.id}`);
      setSelectedSupplier(detail);
      setIsDetailOpen(true);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openPayModal = (supplier) => {
    setSelectedSupplier(supplier);
    setIsPayModalOpen(true);
  };

  const formatMoney = (v) => {
    return new Intl.NumberFormat('fr-MG', { minimumFractionDigits: 0 }).format(v || 0) + ' Ar';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-teal-50/30 to-emerald-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Truck className="w-7 h-7 text-teal-600" />
              Gestion des Fournisseurs
            </h1>
            <p className="text-gray-500">Dettes, paiements et retour de consignes</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl bg-white shadow-sm hover:shadow-md gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-teal-500/30">
              <Plus className="w-5 h-5 mr-2" /> Nouveau Fournisseur
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Dettes</p>
                    <h3 className="text-2xl font-bold text-red-600">{formatMoney(stats.totalDebt)}</h3>
                  </div>
                  <div className="p-3 bg-red-100 rounded-xl"><CreditCard className="w-6 h-6 text-red-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Fournisseurs Actifs</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.active}</h3>
                  </div>
                  <div className="p-3 bg-teal-100 rounded-xl"><User className="w-6 h-6 text-teal-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Avec Dettes</p>
                    <h3 className="text-2xl font-bold text-orange-600">{stats.withDebt}</h3>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-xl"><AlertTriangle className="w-6 h-6 text-orange-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un fournisseur..." className="pl-10 rounded-xl bg-white border-gray-200" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="py-4">Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Dette</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Package className="w-3.5 h-3.5" />
                      Bouteilles à rendre
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Package className="w-3.5 h-3.5" />
                      Cageots à rendre
                    </span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Échéance
                    </span>
                  </TableHead>
                  <TableHead className="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={8} className="h-16 animate-pulse bg-gray-50" /></TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                      Aucun fournisseur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(sup => {
                    const isDueDateOverdue = sup.earliest_due_date && 
                      isAfter(new Date(), new Date(sup.earliest_due_date)) && 
                      parseFloat(sup.total_debt) > 0;
                    const daysUntilDue = sup.earliest_due_date ? 
                      differenceInDays(new Date(sup.earliest_due_date), new Date()) : null;

                    return (
                      <TableRow key={sup.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-gray-900">{sup.name}</TableCell>
                        <TableCell className="text-gray-600">{sup.phone || '—'}</TableCell>
                        <TableCell className="text-gray-600">{sup.contact_info || '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${parseFloat(sup.total_debt) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatMoney(sup.total_debt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {sup.outstanding_bottles > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-bold">
                              <Package className="w-3.5 h-3.5" />
                              {sup.outstanding_bottles}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {sup.outstanding_crates > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">
                              <Package className="w-3.5 h-3.5" />
                              {sup.outstanding_crates}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {sup.earliest_due_date ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
                              isDueDateOverdue 
                                ? 'bg-red-100 text-red-700' 
                                : daysUntilDue !== null && daysUntilDue <= 7 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {isDueDateOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
                              {format(new Date(sup.earliest_due_date), 'dd MMM yyyy', { locale: fr })}
                              {daysUntilDue !== null && daysUntilDue > 0 && (
                                <span className="text-xs opacity-75 ml-1">({daysUntilDue}j)</span>
                              )}
                              {isDueDateOverdue && (
                                <span className="text-xs font-bold ml-1">PASSÉE</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDetail(sup)} className="text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Détails">
                              <Eye className="w-4 h-4" />
                            </Button>
                            {parseFloat(sup.total_debt) > 0 && (
                              <Button variant="ghost" size="icon" onClick={() => openPayModal(sup)} className="text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Payer">
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
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

        {/* Add Supplier Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader><DialogTitle>Nouveau Fournisseur</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(newSupplier); }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom du fournisseur *</Label>
                <Input value={newSupplier.name} onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="Ex: Brasserie STAR" required />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={newSupplier.phone} onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })} placeholder="Ex: 034 00 000 00" />
              </div>
              <div className="space-y-2">
                <Label>Info Contact</Label>
                <Input value={newSupplier.contact_info} onChange={e => setNewSupplier({ ...newSupplier, contact_info: e.target.value })} placeholder="Email, adresse..." />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Annuler</Button>
                <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Ajout...' : 'Ajouter'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Pay Modal */}
        <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Paiement — {selectedSupplier?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm text-gray-500">Dette actuelle :</p>
              <p className="text-xl font-bold text-red-600">{formatMoney(selectedSupplier?.total_debt)}</p>
            </div>
            <form onSubmit={e => { e.preventDefault(); payMut.mutate({ id: selectedSupplier.id, data: payment }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Montant du paiement (Ar) *</Label>
                <Input type="text" inputMode="decimal" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0" required />
              </div>
              <div className="space-y-2">
                <Label>Méthode</Label>
                <div className="flex gap-2">
                  {['cash', 'mobile_money', 'virement'].map(m => (
                    <button key={m} type="button" onClick={() => setPayment({ ...payment, payment_method: m })}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all border ${payment.payment_method === m ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                      {m === 'cash' ? 'Espèces' : m === 'mobile_money' ? 'Mobile Money' : 'Virement'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })} placeholder="Optionnel..." />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPayModalOpen(false)}>Annuler</Button>
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={payMut.isPending}>
                  {payMut.isPending ? 'Enregistrement...' : 'Valider le paiement'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail Modal */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-teal-600" />
                {selectedSupplier?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Téléphone</p>
                  <p className="font-medium">{selectedSupplier?.phone || '—'}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Dette</p>
                  <p className="font-bold text-red-600">{formatMoney(selectedSupplier?.total_debt)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-700 mb-3">Historique des transactions</h4>
                {(selectedSupplier?.transactions || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Aucune transaction pour ce fournisseur</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {selectedSupplier.transactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={t.type === 'payment' ? 'default' : t.type === 'packaging_return' ? 'secondary' : 'outline'}
                              className={t.type === 'payment' ? 'bg-green-100 text-green-700' : t.type === 'packaging_return' ? 'bg-blue-100 text-blue-700' : ''}>
                              {t.type === 'payment' ? 'Paiement' : t.type === 'packaging_return' ? 'Retour consigne' : t.type}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{t.notes || t.date}</p>
                        </div>
                        <span className="font-bold text-green-600">+{formatMoney(t.total_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
