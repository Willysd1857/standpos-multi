import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAppDate } from '@/hooks/useAppDate';
import {
  Wallet, Search, Calendar, Plus, Trash2, TrendingDown,
  ArrowUpRight, DollarSign, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

const CATEGORIES = [
  { value: 'autre', label: 'Autre' },
  { value: 'loyer', label: 'Loyer' },
  { value: 'jirama', label: 'Jirama' },
  { value: 'internet', label: 'Internet' },
  { value: 'salaires', label: 'Salaires' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'transport', label: 'Transport' }
];

export default function Expenses() {
  const { formatDate } = useAppDate();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: 'autre',
    date: new Date().toISOString().split('T')[0]
  });

  const queryClient = base44.queryClient || useQueryClient();

  // Fetch expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list()
  });

  // Fetch purchases
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/purchases');
      return res.ok ? res.json() : [];
    }
  });

  // Fetch purchase groups
  const { data: purchaseGroups = [] } = useQuery({
    queryKey: ['purchase-groups'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/purchase-groups');
      return res.ok ? res.json() : [];
    }
  });

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

  // Memoized filtered expenses - recalculé seulement quand expenses ou searchQuery change
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchSearch = !searchQuery.trim() ||
        e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [expenses, searchQuery, categoryFilter]);

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
      alert(`Erreur: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      alert('Dépense supprimée');
    }
  });

  // Memoized handlers
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;

    createMutation.mutate({
      ...newExpense,
      amount: Number(newExpense.amount)
    });
  }, [newExpense, createMutation]);

  const handleDelete = useCallback((id) => {
    if (window.confirm('Supprimer cette dépense ?')) {
      deleteMutation.mutate(id);
    }
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
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Wallet className="w-7 h-7 text-red-600" />
              Gestion des Dépenses
            </h1>
            <p className="text-gray-500">Suivez et gérez vos dépenses opérationnelles</p>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white rounded-xl shadow-lg shadow-red-500/30"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nouvelle Dépense
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm overflow-hidden relative">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Dépenses</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()} Ar</h3>
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
                    <h3 className="text-2xl font-bold text-gray-900">{stats.today.toLocaleString()} Ar</h3>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Rechercher une dépense..."
              className="pl-10 rounded-xl bg-white border-gray-200"
            />
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
            <SelectTrigger className="w-[200px] rounded-xl bg-white border-gray-200">
              <Filter className="w-4 h-4 mr-2 text-gray-500" />
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                          {CATEGORIES.find(c => c.value === expense.category)?.label || expense.category || 'Autre'}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {formatDate(expense.date, 'dd MMMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        -{Number(expense.amount).toLocaleString()} Ar
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(expense.id)}
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
                  id="description"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  placeholder="Ex: Facture électricité"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Montant (Ar)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Select
                  value={newExpense.category}
                  onValueChange={(val) => setNewExpense({ ...newExpense, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
