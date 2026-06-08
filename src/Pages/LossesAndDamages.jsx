import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Search, Plus, RefreshCw, DollarSign,
  Package, CheckCircle2, XCircle, ShieldAlert, User
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const API_BASE = '/api';
const getToken = () => localStorage.getItem('auth_token');
const fetchAPI = async (endpoint, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'Request failed'); }
  return res.json();
};

const TYPES = {
  loss: { label: 'Perte', color: 'bg-orange-100 text-orange-700' },
  damage: { label: 'Casse', color: 'bg-red-100 text-red-700' },
};

export default function LossesAndDamages() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeclareOpen, setIsDeclareOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '', quantity: '', empty_packaging_qty: '', empty_secondary_packaging_qty: '',
    type: 'damage', responsible_user_id: '', notes: ''
  });

  const { data: losses = [], isLoading, refetch } = useQuery({
    queryKey: ['losses'],
    queryFn: () => fetchAPI('/losses'),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-list'],
    queryFn: () => fetchAPI('/products'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => fetchAPI('/users').catch(() => []),
  });

  const packagingProducts = useMemo(
    () => products.filter(p => p.has_packaging || p.packaging_type_id),
    [products]
  );

  const stats = useMemo(() => {
    const totalValue = losses.reduce((s, l) => s + (parseFloat(l.financial_value) || 0), 0);
    const unreimbursed = losses.filter(l => !l.is_reimbursed).reduce((s, l) => s + (parseFloat(l.financial_value) || 0), 0);
    const reimbursedCount = losses.filter(l => l.is_reimbursed).length;
    return { totalValue, unreimbursed, reimbursedCount, total: losses.length };
  }, [losses]);

  const filtered = useMemo(() => {
    let list = losses;
    if (tab === 'pending') list = list.filter(l => !l.is_reimbursed);
    if (tab === 'reimbursed') list = list.filter(l => l.is_reimbursed);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(l =>
        l.product?.name?.toLowerCase().includes(q) ||
        l.user?.full_name?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [losses, tab, searchQuery]);

  const declareMut = useMutation({
    mutationFn: (data) => fetchAPI('/losses', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['losses'] });
      setIsDeclareOpen(false);
      setForm({ product_id: '', quantity: '', empty_packaging_qty: '', empty_secondary_packaging_qty: '', type: 'damage', responsible_user_id: '', notes: '' });
      toast.success(`Perte déclarée. Valeur: ${formatMoney(data.totalFinancialValue)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const reimburseMut = useMutation({
    mutationFn: (id) => fetchAPI(`/losses/${id}/reimburse`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['losses'] });
      toast.success('Remboursement confirmé');
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDeclare = (e) => {
    e.preventDefault();
    if (!form.product_id) {
      toast.error('Veuillez sélectionner un produit concerné');
      return;
    }
    const data = {
      ...form,
      quantity: Number(form.quantity) || 0,
      empty_packaging_qty: Number(form.empty_packaging_qty) || 0,
      empty_secondary_packaging_qty: Number(form.empty_secondary_packaging_qty) || 0,
    };
    declareMut.mutate(data);
  };

  const handleReimburse = (loss) => {
    toast(`Confirmer le remboursement ?`, {
      description: `${loss.user?.full_name || 'Responsable'} a remboursé ${formatMoney(loss.financial_value)}`,
      action: { label: 'Confirmer', onClick: () => reimburseMut.mutate(loss.id) },
    });
  };

  const formatMoney = (v) => new Intl.NumberFormat('fr-MG', { minimumFractionDigits: 0 }).format(v || 0) + ' Ar';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-rose-50/30 to-red-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-rose-600" />
              Pertes & Casses
            </h1>
            <p className="text-gray-500">Déclaration et suivi des remboursements</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl bg-white shadow-sm hover:shadow-md gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
            <Button onClick={() => setIsDeclareOpen(true)} className="bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white rounded-xl shadow-lg shadow-rose-500/30">
              <Plus className="w-5 h-5 mr-2" /> Déclarer une Perte
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm"><CardContent className="p-6"><div className="flex justify-between items-start">
              <div><p className="text-sm font-medium text-gray-500 mb-1">Total Déclarations</p><h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3></div>
              <div className="p-3 bg-gray-100 rounded-xl"><AlertTriangle className="w-6 h-6 text-gray-600" /></div>
            </div></CardContent></Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm"><CardContent className="p-6"><div className="flex justify-between items-start">
              <div><p className="text-sm font-medium text-gray-500 mb-1">Valeur Totale</p><h3 className="text-2xl font-bold text-red-600">{formatMoney(stats.totalValue)}</h3></div>
              <div className="p-3 bg-red-100 rounded-xl"><DollarSign className="w-6 h-6 text-red-600" /></div>
            </div></CardContent></Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm"><CardContent className="p-6"><div className="flex justify-between items-start">
              <div><p className="text-sm font-medium text-gray-500 mb-1">Non Remboursé</p><h3 className="text-2xl font-bold text-orange-600">{formatMoney(stats.unreimbursed)}</h3></div>
              <div className="p-3 bg-orange-100 rounded-xl"><XCircle className="w-6 h-6 text-orange-600" /></div>
            </div></CardContent></Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-sm"><CardContent className="p-6"><div className="flex justify-between items-start">
              <div><p className="text-sm font-medium text-gray-500 mb-1">Remboursés</p><h3 className="text-2xl font-bold text-green-600">{stats.reimbursedCount}</h3></div>
              <div className="p-3 bg-green-100 rounded-xl"><CheckCircle2 className="w-6 h-6 text-green-600" /></div>
            </div></CardContent></Card>
          </motion.div>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Tabs value={tab} onValueChange={setTab} className="flex-shrink-0">
            <TabsList className="bg-white border shadow-sm rounded-xl">
              <TabsTrigger value="all" className="rounded-lg">Tous</TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg">En attente</TabsTrigger>
              <TabsTrigger value="reimbursed" className="rounded-lg">Remboursés</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher..." className="pl-10 rounded-xl bg-white border-gray-200" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="py-4">Produit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-right">Valeur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => <TableRow key={i}><TableCell colSpan={7} className="h-16 animate-pulse bg-gray-50" /></TableRow>)
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-500">Aucune déclaration</TableCell></TableRow>
                ) : (
                  filtered.map(loss => {
                    const t = TYPES[loss.type] || TYPES.damage;
                    return (
                      <TableRow key={loss.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-gray-900">{loss.product?.name || '?'}</TableCell>
                        <TableCell><Badge className={`${t.color} border-0`}>{t.label}</Badge></TableCell>
                        <TableCell className="text-gray-600">
                          {loss.quantity > 0 && <span>{loss.quantity} unité(s)</span>}
                          {loss.empty_packaging_qty > 0 && <span className="block text-xs text-gray-400">{loss.empty_packaging_qty} emb.</span>}
                        </TableCell>
                        <TableCell className="text-gray-600">{loss.user?.full_name || '—'}</TableCell>
                        <TableCell className="text-right font-bold text-red-600">{formatMoney(loss.financial_value)}</TableCell>
                        <TableCell>
                          {loss.is_reimbursed
                            ? <Badge className="bg-green-100 text-green-700 border-0 gap-1"><CheckCircle2 className="w-3 h-3" /> Remboursé</Badge>
                            : <Badge className="bg-orange-100 text-orange-700 border-0 gap-1"><XCircle className="w-3 h-3" /> En attente</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {!loss.is_reimbursed && (
                            <Button size="sm" onClick={() => handleReimburse(loss)} className="bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs gap-1">
                              <DollarSign className="w-3.5 h-3.5" /> Remboursé
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Declare Modal */}
        <Dialog open={isDeclareOpen} onOpenChange={setIsDeclareOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-600" /> Déclarer une perte / casse</DialogTitle></DialogHeader>
            <form onSubmit={handleDeclare} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Produit concerné *</Label>
                <Select
                  value={form.product_id}
                  onValueChange={(value) => setForm({ ...form, product_id: value })}
                >
                  <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                    <SelectValue placeholder="Choisir un produit avec emballage..." />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    {packagingProducts.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500">Aucun produit avec emballage</div>
                    ) : (
                      packagingProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, type: 'damage' })}
                    className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium transition-all border ${form.type === 'damage' ? 'border-red-500 bg-red-50 text-red-700 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                    🔨 Casse
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, type: 'loss' })}
                    className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium transition-all border ${form.type === 'loss' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                    📦 Perte
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Qté produit</Label>
                  <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Emb. vides</Label>
                  <Input type="number" value={form.empty_packaging_qty} onChange={e => setForm({ ...form, empty_packaging_qty: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Emb. 2nd</Label>
                  <Input type="number" value={form.empty_secondary_packaging_qty} onChange={e => setForm({ ...form, empty_secondary_packaging_qty: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Responsable</Label>
                <select value={form.responsible_user_id} onChange={e => setForm({ ...form, responsible_user_id: e.target.value })}
                  className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <option value="">Sélectionner...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Détails..." />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDeclareOpen(false)}>Annuler</Button>
                <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white" disabled={declareMut.isPending}>
                  {declareMut.isPending ? 'Déclaration...' : 'Déclarer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
