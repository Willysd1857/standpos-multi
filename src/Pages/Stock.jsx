import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, Search, AlertTriangle, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import StockTable from '@/components/stock/StockTable';
import StockAdjustModal from '@/components/stock/StockAdjustModal';

export default function Stock() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const adjustStockMutation = useMutation({
    mutationFn: async ({ product, adjustData }) => {
      let newStock;
      let quantityChange;

      if (adjustData.type === 'ajustement') {
        newStock = adjustData.quantity;
        quantityChange = adjustData.quantity - (product.stock || 0);
      } else {
        quantityChange = adjustData.quantity;
        newStock = (product.stock || 0) + quantityChange;
      }

      await base44.entities.Product.update(product.id, { stock: newStock });

      await base44.entities.StockMovement.create({
        product_id: product.id,
        product_name: product.name,
        movement_type: adjustData.type,
        quantity: quantityChange,
        stock_before: product.stock || 0,
        stock_after: newStock,
        notes: adjustData.notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedProduct(null);
    }
  });

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'low' && product.stock <= (product.min_stock || 5) && product.stock > 0) ||
        (statusFilter === 'out' && product.stock <= 0) ||
        (statusFilter === 'ok' && product.stock > (product.min_stock || 5));
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: products.filter(p => p.stock <= (p.min_stock || 5) && p.stock > 0).length,
    outOfStock: products.filter(p => p.stock <= 0).length,
    totalValue: products.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost_price || p.price || 0)), 0)
  }), [products]);

  const handleSearchChange = useCallback((e) => setSearchQuery(e.target.value), []);
  const handleCategoryChange = useCallback((val) => setCategoryFilter(val), []);
  const handleStatusChange = useCallback((val) => setStatusFilter(val), []);
  const handleEdit = useCallback((product) => setSelectedProduct(product), []);
  const handleAdjustConfirm = useCallback((adjustData) => {
    adjustStockMutation.mutate({ product: selectedProduct, adjustData });
  }, [adjustStockMutation, selectedProduct]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Package className="w-7 h-7 text-blue-600" />
              Gestion de Stock
            </h1>
            <p className="text-gray-500">Suivez et gérez votre inventaire</p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Produits</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Stock bas</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.lowStock}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Rupture</p>
                    <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Valeur stock</p>
                    <p className="text-2xl font-bold text-green-600">{stats.totalValue.toLocaleString()}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
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
              placeholder="Rechercher un produit..."
              className="pl-10 rounded-xl border-gray-200"
            />
          </div>

          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl">
              <Filter className="w-4 h-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="ok">En stock</SelectItem>
              <SelectItem value="low">Stock bas</SelectItem>
              <SelectItem value="out">Rupture</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <StockTable
          products={filteredProducts}
          categories={categories}
          onEdit={handleEdit}
        />

        {/* Adjust modal */}
        <StockAdjustModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          onConfirm={handleAdjustConfirm}
        />
      </div>
    </div>
  );
}