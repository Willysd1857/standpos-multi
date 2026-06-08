import React, { useState, useMemo, useCallback } from 'react';
import { formatAmount } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAppDate } from '@/hooks/useAppDate';
import { useAutoFocus } from '@/hooks/useAutoFocus';
import {
  Wallet, Search, Calendar, Plus, Trash2, TrendingDown,
  ArrowUpRight, DollarSign, Filter, RefreshCw, ChevronDown
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'autre', label: 'Autre' },
  { value: 'loyer', label: 'Loyer' },
  { value: 'jirama', label: 'Jirama' },
  { value: 'internet', label: 'Internet' },
  { value: 'salaires', label: 'Salaires' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'transport', label: 'Transport' },
  { value: 'achats_stock', label: 'Achats Stock' }
];

export default function Expenses() {
  const { formatDate } = useAppDate();
  const { formatCurrency, convertToAriary, getCurrencySymbol } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: 'autre',
    date: new Date().toISOString().split('T')[0]
  });
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Auto-focus hook for input fields
  const descriptionRef = useAutoFocus([isAddModalOpen]);
  const amountRef = useAutoFocus([]);

  const queryClient = base44.queryClient || useQueryClient();

  // Fetch expenses
  const { data: expenses = [], isLoading: loadingExpenses, isRefetching: refetchingExpenses, refetch: refetchExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list()
  });

  // Fetch purchases
  const { data: purchases = [], isLoading: loadingPurchases, refetch: refetchPurchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list()
  });

  // Fetch purchase groups
  const { data: purchaseGroups = [], isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ['purchase-groups'],
    queryFn: () => base44.entities.PurchaseGroup.list()
  });

  const handleRefresh = () => {
    refetchExpenses();
    refetchPurchases();
    refetchGroups();
  };

  const isRefreshing = loadingExpenses || refetchingExpenses || loadingPurchases || loadingGroups;
  const isLoading = loadingExpenses && expenses.length === 0;

  // Memoized calculations - calculés une seule fois quand expenses, purchases, purchaseGroups changent
  const stats = useMemo(() => {
    const operationalTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const purchaseTotal = purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
    const purchaseGroupTotal = purchaseGroups.reduce((sum, pg) => sum + (Number(pg.total_amount) || 0), 0);

    const total = operationalTotal + purchaseTotal + purchaseGroupTotal;

    const todayDate = new Date().toDateString();
    const todayExpenses = expenses
      .filter(e => new Date(e.date).toDateString() === todayDate)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const todayPurchases = purchases
      .filter(p => new Date(p.date || p.created_at).toDateString() === todayDate)
      .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
    const todayPurchaseGroups = purchaseGroups
      .filter(pg => new Date(pg.date || pg.created_at).toDateString() === todayDate)
      .reduce((sum, pg) => sum + (Number(pg.total_amount) || 0), 0);

    const today = todayExpenses + todayPurchases + todayPurchaseGroups;

    return { total, today };
  }, [expenses, purchases, purchaseGroups]);

  // Consolidated list of all money out (Expenses + Purchases)
  const consolidatedExpenses = useMemo(() => {
    const operational = expenses.map(e => ({
      ...e,
      source: 'operational'
    }));

    const groups = purchaseGroups.map(pg => ({
      id: pg.id,
      description: `Achat: ${pg.reference} ${pg.supplier_name ? `(${pg.supplier_name})` : ''}`,
      amount: pg.total_amount,
      category: 'achats_stock',
      date: pg.date || pg.created_at,
      source: 'purchase'
    }));

    const individuals = purchases.map(p => ({
      id: p.id,
      description: `Achat: ${p.product_name} ${p.supplier_name ? `(${p.supplier_name})` : ''}`,
      amount: p.total_amount,
      category: 'achats_stock',
      date: p.date || p.created_at,
      source: 'purchase'
    }));

    return [...operational, ...groups, ...individuals].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, purchaseGroups, purchases]);

  // Memoized filtered results
  const filteredExpenses = useMemo(() => {
    return consolidatedExpenses.filter(e => {
      const matchSearch = !searchQuery.trim() ||
        e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [consolidatedExpenses, searchQuery, categoryFilter]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create(data),
    onSuccess: (newExpenseData) => {
      queryClient.setQueryData(['expenses'], (oldExpenses) => {
        return oldExpenses ? [...oldExpenses, newExpenseData] : [newExpenseData];
      });
      // Invalidate to ensure eventual consistency with the server, but UI is updated immediately
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setIsAddModalOpen(false);
      setNewExpense({
        description: '',
        amount: '',
        category: 'autre',
        date: new Date().toISOString().split('T')[0]
      });
    },
    onError: (error) => {
      console.error('Error creating expense:', error);
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['expenses'] });

      // Snapshot previous value
      const previousExpenses = queryClient.getQueryData(['expenses']);

      // Optimistically remove from UI
      queryClient.setQueryData(['expenses'], (old) =>
        old ? old.filter(e => e.id !== id) : []
      );

      return { previousExpenses };
    },
    onError: (err, id, context) => {
      // Rollback on error
      queryClient.setQueryData(['expenses'], context.previousExpenses);
      toast.error(`Erreur lors de la suppression: ${err.message}`);
    },
    onSuccess: () => {
      toast.success('Dépense supprimée avec succès');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    }
  });

  // Memoized handlers
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;

    createMutation.mutate({
      ...newExpense,
      amount: convertToAriary(Number(newExpense.amount))
    });
  }, [newExpense, createMutation]);

  const handleDelete = useCallback((id) => {
    toast('Confirmer la suppression', {
      description: 'Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.',
      action: {
        label: 'Supprimer',
        onClick: () => deleteMutation.mutate(id)
      }
    });
  }, [deleteMutation]);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleCategoryFilterChange = useCallback((value) => {
    setCategoryFilter(value);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Wallet className="w-7 h-7 text-red-600" />
              Gestion des Dépenses
            </h1>
            <p className="text-gray-500">Suivez et gérez vos dépenses opérationnelles</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-xl bg-white shadow-sm hover:shadow-md transition-all gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>

            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white rounded-xl shadow-lg shadow-red-500/30"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nouvelle Dépense
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm overflow-hidden relative">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Dépenses</p>
                    <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total)}</h3>
                  </div>
                  <div className="p-3 bg-red-100 rounded-xl">
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm overflow-hidden relative">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Dépenses du Jour</p>
                    <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats.today)}</h3>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-xl">
                    <Calendar className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
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
              onChange={handleSearchChange}
              placeholder="Rechercher une dépense..."
              className="pl-10 rounded-xl bg-white border-gray-200"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className="flex h-10 w-[200px] items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span>{categoryFilter === 'all' ? 'Toutes catégories' : CATEGORIES.find(c => c.value === categoryFilter)?.label}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
            {isFilterMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsFilterMenuOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5">
                  <button
                    onClick={() => {
                      handleCategoryFilterChange('all');
                      setIsFilterMenuOpen(false);
                    }}
                    className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${categoryFilter === 'all' ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50'}`}
                  >
                    Toutes catégories
                  </button>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => {
                        handleCategoryFilterChange(cat.value);
                        setIsFilterMenuOpen(false);
                      }}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${categoryFilter === cat.value ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="py-4">Description</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5} className="h-16 animate-pulse bg-gray-50" />
                    </TableRow>
                  ))
                ) : filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                      Aucune dépense trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <TableCell className="font-medium text-gray-900">{expense.description}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${expense.source === 'purchase'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}>
                          {CATEGORIES.find(c => c.value === expense.category)?.label || expense.category || 'Autre'}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {formatDate(expense.date, 'dd MMMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        -{formatCurrency(expense.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {expense.source === 'operational' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(expense.id)}
                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-medium px-2 italic">Auto</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Add Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Ajouter une dépense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  ref={descriptionRef}
                  id="description"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  placeholder="Ex: Facture électricité"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Montant ({getCurrencySymbol()})</Label>
                <Input
                  ref={amountRef}
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  value={newExpense.amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setNewExpense({ ...newExpense, amount: val });
                  }}
                  onWheel={(e) => e.target.blur()}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{CATEGORIES.find(c => c.value === newExpense.category)?.label || "Choisir une catégorie"}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>
                  {isCategoryMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[60]"
                        onClick={() => setIsCategoryMenuOpen(false)}
                      />
                      <div className="absolute left-0 top-full z-[70] mt-1 w-full max-h-60 overflow-auto rounded-md border bg-white p-1 shadow-md">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => {
                              setNewExpense({ ...newExpense, category: cat.value });
                              setIsCategoryMenuOpen(false);
                            }}
                            className={`w-full flex items-center px-3 py-2 text-sm rounded-sm transition-colors ${newExpense.category === cat.value ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50'}`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                  required
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">
                  Ajouter
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
