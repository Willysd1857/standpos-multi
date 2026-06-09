import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAPI } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, Package, Search, AlertTriangle, TrendingUp, TrendingDown, Filter, RefreshCw, Wine, Boxes, Plus, Equal, ArrowRight, Truck, ClipboardCheck, Sliders, Warehouse, Store } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StockTable from '@/components/stock/StockTable';
import StockAdjustModal from '@/components/stock/StockAdjustModal';
import CustomerPackagingTab from '@/components/stock/CustomerPackagingTab';
import EmptyPackagingTransferModal from '@/components/stock/EmptyPackagingTransferModal';
import EmptyPackagingReceptionModal from '@/components/stock/EmptyPackagingReceptionModal';
import PackagingAdjustModal from '@/components/stock/PackagingAdjustModal';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

export default function Stock() {
  const { formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [adjustingLocation, setAdjustingLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const queryClient = useQueryClient();

  const { user, isAdmin } = useAuth();

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchAPI('/locations'),
    enabled: isAdmin() && !user?.location_id,
  });

  const { data: allProducts = [], isLoading: loadingProducts, isRefetching: refetchingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: allRecipes = [], refetch: refetchRecipes } = useQuery({
    queryKey: ['recipes-all'],
    queryFn: () => fetch('/api/products/recipes/all').then(r => r.json()),
    staleTime: 30000
  });

  // Stock d'emballages vides de l'emplacement de l'utilisateur courant.
  // Pour un non-admin, on veut afficher la quantité PHYSIQUE à son poste,
  // pas le compteur global products.empty_packaging_qty (qui ne change pas
  // lors d'un transfert inter-emplacements puisque le total système est
  // inchangé — seul stock_by_location varie).
  // NB : l'endpoint renvoie { location, items, totals } — on extrait .items.
  const { data: locationPackagingData, refetch: refetchLocationStock } = useQuery({
    queryKey: ['location-packaging-stock', user?.location_id],
    queryFn: () => fetchAPI(`/locations/${user.location_id}/packaging-stock`),
    enabled: !!user?.location_id && !isAdmin(),
    staleTime: 15000,
  });
  const locationPackagingStock = locationPackagingData?.items || [];

  // Map product_id -> { empty_packaging_qty, empty_secondary_packaging_qty }
  const locationStockByProduct = useMemo(() => {
    const m = new Map();
    for (const s of locationPackagingStock) {
      m.set(s.product_id, {
        empty_packaging_qty: Number(s.empty_packaging_qty) || 0,
        empty_secondary_packaging_qty: Number(s.empty_secondary_packaging_qty) || 0
      });
    }
    return m;
  }, [locationPackagingStock]);

  // Compute stock for recipe products from raw material stocks.
  // Pour les non-admin, on remappe les `empty_packaging_qty` /
  // `empty_secondary_packaging_qty` depuis le stock par emplacement de
  // l'utilisateur, car c'est ce qui reflète la réalité physique au poste.
  // Le compteur global `products.empty_packaging_qty` ne change pas lors
  // d'un transfert entre emplacements (le total système reste constant).
  const products = useMemo(() => {
    return allProducts.map(p => {
      let result = p;
      if (p.product_type === 'recipe') {
        const recipeIngredients = allRecipes.filter(r => r.product_id === p.id);
        if (recipeIngredients.length > 0) {
          const portions = recipeIngredients.map(r => {
            const consumptionPerUnit = r.quantity_per_batch / r.batch_size;
            return consumptionPerUnit > 0 ? Math.floor(r.raw_material_stock / consumptionPerUnit) : Infinity;
          });
          result = { ...p, stock: Math.min(...portions), track_stock: true };
        }
      }
      // Override par-emplacement pour non-admin. Si le produit n'a
      // aucune ligne stock_by_location à l'emplacement de l'utilisateur
      // (jamais reçu, ou 0 emballages vides), on force 0 — sinon on
      // afficherait le total système, ce qui est trompeur.
      if (!isAdmin() && p.has_packaging) {
        const locStock = locationStockByProduct.get(p.id);
        result = {
          ...result,
          empty_packaging_qty: locStock ? locStock.empty_packaging_qty : 0,
          empty_secondary_packaging_qty: locStock ? locStock.empty_secondary_packaging_qty : 0
        };
      }
      return result;
    });
  }, [allProducts, allRecipes, locationStockByProduct, isAdmin]);

  const { data: categories = [], isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: customerConsignments = [] } = useQuery({
    queryKey: ['customer-packaging-consignments-detailed'],
    queryFn: () => base44.entities.Packaging.getConsignments({ entity_type: 'customer' })
  });

  // Transferts d'emballages vides en attente de réception
  const { data: allTransfers = [], refetch: refetchTransfers } = useQuery({
    queryKey: ['pending-packaging-transfers'],
    queryFn: () => base44.entities.StockTransfer.list(),
    staleTime: 30000,
  });

  // Filtrer les transferts en transit d'emballages vides destinés à l'utilisateur
  const pendingReceptions = useMemo(() => {
    return allTransfers.filter(t =>
      t.status === 'in_transit' &&
      t.transfer_type === 'empty_packaging' &&
      (isAdmin() || (user?.location_id && t.to_location_id === user.location_id))
    );
  }, [allTransfers, user, isAdmin]);

  const handleRefresh = () => {
    refetchProducts();
    refetchCategories();
    refetchRecipes();
    refetchTransfers();
    refetchLocationStock();
  };

  const isRefreshing = loadingProducts || refetchingProducts || loadingCategories;

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
      toast.success('Stock ajusté avec succès');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['location-packaging-stock'] });
      setSelectedProduct(null);
    },
    onError: (e) => toast.error(e.message || 'Erreur lors de l\'ajustement du stock')
  });

  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        // Show products that track stock, and always include recipe products (their stock is computed)
        if (!product.track_stock && product.product_type !== 'recipe') return false;

        // Non-admin (Entrepôt) should ONLY see products with packaging AND the empty packagings themselves
        if (!isAdmin() && !product.has_packaging) {
          const cat = categories.find(c => c.id === product.category_id);
          const isEmballageCategory = cat && cat.name.toLowerCase().includes('emballage');
          const isPackagingProduct = product.name.toLowerCase().includes('vide') || product.name.toLowerCase().includes('cageot');
          
          if (!isEmballageCategory && !isPackagingProduct) {
            return false;
          }
        }

        const matchesSearch = !searchQuery ||
          product.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
        const matchesStatus = statusFilter === 'all' ||
          (statusFilter === 'low' && product.stock <= (product.min_stock || 5) && product.stock > 0) ||
          (statusFilter === 'out' && product.stock <= 0) ||
          (statusFilter === 'ok' && product.stock > (product.min_stock || 5));
        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        const getStatusPriority = (p) => {
          if (p.stock <= 0) return 0; // Rupture
          if (p.stock <= (p.min_stock || 5)) return 1; // Critique
          return 2; // En stock
        };

        const priorityA = getStatusPriority(a);
        const priorityB = getStatusPriority(b);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // If same priority, sort by name
        return a.name.localeCompare(b.name);
      });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    // Only count products that track stock
    const stockProducts = products.filter(p => p.track_stock);

    let totalEmptyBottles = 0;
    let totalEmptyCrates = 0;

    products.forEach(p => {
      const name = p.name.toLowerCase();
      const cat = categories.find(c => c.id === p.category_id);
      const isEmballageCategory = cat && cat.name.toLowerCase().includes('emballage');
      const isPackagingProduct = !p.has_packaging && (isEmballageCategory || name.includes('vide') || name.includes('cageot'));

      if (isPackagingProduct) {
        // Standalone packaging product — count its stock (quantity), NOT empty_packaging_qty
        if (name.includes('cageot')) {
          totalEmptyCrates += (Number(p.stock) || 0);
        } else if (name.includes('bouteille')) {
          totalEmptyBottles += (Number(p.stock) || 0);
        }
      } else if (p.has_packaging) {
        // Product that HAS associated packaging — count its empty_packaging_qty
        totalEmptyBottles += (Number(p.empty_packaging_qty) || 0);
        totalEmptyCrates += (Number(p.empty_secondary_packaging_qty) || 0);
      }
    });

    return {
      total: stockProducts.length,
      lowStock: stockProducts.filter(p => p.stock <= (p.min_stock || 5) && p.stock > 0).length,
      outOfStock: stockProducts.filter(p => p.stock <= 0).length,
      totalValue: stockProducts.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost_price || p.price || 0)), 0),
      emptyBottles: totalEmptyBottles,
      emptyCrates: totalEmptyCrates
    };
  }, [products, categories]);

  const packagingOverview = useMemo(() => {
    let fullBottles = 0;
    let fullCrates = 0;
    let fullBottlesInStock = 0;
    let fullCratesInStock = 0;
    let fullBottlesAtClients = 0;
    let fullCratesAtClients = 0;

    // 1) Emballages PLEINS en stock (entrepôt) :
    //    Chaque unité en stock d'un produit avec emballage = 1 bouteille pleine
    //    Le nombre de cages pleines en stock = floor(stock / bottles_per_crate)
    products.filter(p => p.has_packaging).forEach(p => {
      const stock = Number(p.stock) || 0;
      const bottlesPerCrate = Number(p.bottles_per_crate) || 0;
      fullBottlesInStock += stock;
      fullBottles += stock;
      if (bottlesPerCrate > 0) {
        const cratesFromStock = Math.floor(stock / bottlesPerCrate);
        fullCratesInStock += cratesFromStock;
        fullCrates += cratesFromStock;
      }
    });

    // 2) Emballages PLEINS en circulation chez les clients (consignations en attente)
    const pending = customerConsignments.filter(c => c.status === 'pending' || c.status === 'partial');
    pending.forEach(c => {
      const b = Number(c.empty_packaging_qty) || 0;
      const cr = Number(c.empty_secondary_packaging_qty) || 0;
      fullBottlesAtClients += b;
      fullCratesAtClients += cr;
      fullBottles += b;
      fullCrates += cr;
    });

    // 3) Emballages VIDES (déjà calculés dans stats)
    return {
      fullBottles,
      fullCrates,
      fullBottlesInStock,
      fullCratesInStock,
      fullBottlesAtClients,
      fullCratesAtClients,
      emptyBottles: stats.emptyBottles,
      emptyCrates: stats.emptyCrates,
      totalBottles: fullBottles + stats.emptyBottles,
      totalCrates: fullCrates + stats.emptyCrates
    };
  }, [products, customerConsignments, stats.emptyBottles, stats.emptyCrates]);

  const handleSearchChange = useCallback((e) => setSearchQuery(e.target.value), []);
  const handleCategoryChange = useCallback((val) => setCategoryFilter(val), []);
  const handleStatusChange = useCallback((val) => setStatusFilter(val), []);
  const handleEdit = useCallback((product) => setSelectedProduct(product), []);
  const handleAdjustConfirm = useCallback(async (adjustData) => {
    await adjustStockMutation.mutateAsync({ product: selectedProduct, adjustData });
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
            <p className="text-gray-500">Suivez et gérez votre inventaire et vos emballages</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowTransferModal(true)}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-sm hover:shadow-md transition-all gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Transférer Emballages Vides
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (user?.location_id) {
                  setAdjustingLocation({ id: user.location_id, name: user.location_name || 'Mon emplacement' });
                } else if (isAdmin()) {
                  setShowLocationPicker(true);
                }
              }}
              disabled={!user?.location_id && !isAdmin()}
              className="rounded-xl bg-white border-orange-200 text-orange-700 hover:bg-orange-50 shadow-sm gap-2"
              title="Ajuster le stock d'emballages de votre emplacement (inventaire physique)"
            >
              <Sliders className="w-4 h-4" />
              Ajuster Inventaire
            </Button>
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
          </div>
        </div>

        {/* ── Alerte réceptions en attente ──────────────────────────────── */}
        <AnimatePresence>
          {pendingReceptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-md shadow-amber-100"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-amber-900 flex items-center gap-2">
                      <span>Réception d'emballages en attente</span>
                      <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {pendingReceptions.length}
                      </span>
                    </h3>
                    <p className="text-sm text-amber-700 mt-0.5">
                      Des emballages vides vous ont été envoyés et attendent votre validation.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {pendingReceptions.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTransfer(t)}
                          className="flex items-center gap-1.5 bg-white border border-amber-300 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-50 hover:shadow-sm transition-all"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          {t.reference} · {t.from_loc?.name || 'Expéditeur'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex space-x-2 bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-fit">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'general' 
                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Stock Général
          </button>
          <button
            onClick={() => setActiveTab('consignments')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'consignments' 
                ? 'bg-orange-50 text-orange-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Emballages Clients
            <span className="bg-orange-200 text-orange-800 py-0.5 px-2 rounded-full text-xs font-bold">
              {products.filter(p => p.has_packaging).length}
            </span>
          </button>
        </div>

        {activeTab === 'general' ? (
          <>
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
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalValue)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Récapitulatif Emballages : Pleins + Vides = Total */}
        {(packagingOverview.totalBottles > 0 || packagingOverview.totalCrates > 0 || !isAdmin()) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-0 shadow-md overflow-hidden bg-gradient-to-br from-white via-orange-50/40 to-rose-50/40">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">Parc total d'emballages</h3>
                    <p className="text-xs text-gray-500">Formule : Emballages pleins + vides = total en circulation</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bouteilles */}
                  <div className="bg-white rounded-2xl border border-purple-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Wine className="w-4 h-4 text-purple-700" />
                      </div>
                      <h4 className="font-semibold text-purple-900 text-sm uppercase tracking-wide">Bouteilles</h4>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-[90px] text-center bg-orange-50 rounded-xl py-3 px-2 border border-orange-100">
                        <div className="text-[11px] text-orange-700 font-semibold uppercase tracking-wide">Remplies</div>
                        <div className="text-2xl font-bold text-orange-900 mt-1">{packagingOverview.fullBottles}</div>
                        <div className="text-[10px] text-orange-600 flex items-center justify-center gap-1.5 mt-0.5">
                          <span title="En stock" className="inline-flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            {packagingOverview.fullBottlesInStock} stock
                          </span>
                          <span className="text-orange-300">·</span>
                          <span title="Chez clients" className="inline-flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {packagingOverview.fullBottlesAtClients} clients
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
                        <Plus className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-[90px] text-center bg-purple-50 rounded-xl py-3 px-2 border border-purple-100">
                        <div className="text-[11px] text-purple-700 font-semibold uppercase tracking-wide">Vides</div>
                        <div className="text-2xl font-bold text-purple-900 mt-1">{packagingOverview.emptyBottles}</div>
                        <div className="text-[10px] text-purple-600">en stock</div>
                      </div>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
                        <Equal className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-[90px] text-center bg-gradient-to-br from-orange-100 to-purple-100 rounded-xl py-3 px-2 border border-orange-200">
                        <div className="text-[11px] text-gray-800 font-semibold uppercase tracking-wide">Total</div>
                        <div className="text-2xl font-bold text-gray-900 mt-1">{packagingOverview.totalBottles}</div>
                        <div className="text-[10px] text-gray-600">emballages</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500 text-center italic">
                      Bouteilles : {packagingOverview.fullBottles} Remplies + {packagingOverview.emptyBottles} Vides = Total {packagingOverview.totalBottles} Emballages
                    </div>
                  </div>

                  {/* Cageots */}
                  <div className="bg-white rounded-2xl border border-indigo-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Boxes className="w-4 h-4 text-indigo-700" />
                      </div>
                      <h4 className="font-semibold text-indigo-900 text-sm uppercase tracking-wide">Cageots</h4>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-[90px] text-center bg-amber-50 rounded-xl py-3 px-2 border border-amber-100">
                        <div className="text-[11px] text-amber-700 font-semibold uppercase tracking-wide">Remplis</div>
                        <div className="text-2xl font-bold text-amber-900 mt-1">{packagingOverview.fullCrates}</div>
                        <div className="text-[10px] text-amber-600 flex items-center justify-center gap-1.5 mt-0.5">
                          <span title="En stock" className="inline-flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {packagingOverview.fullCratesInStock} stock
                          </span>
                          <span className="text-amber-300">·</span>
                          <span title="Chez clients" className="inline-flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {packagingOverview.fullCratesAtClients} clients
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
                        <Plus className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-[90px] text-center bg-indigo-50 rounded-xl py-3 px-2 border border-indigo-100">
                        <div className="text-[11px] text-indigo-700 font-semibold uppercase tracking-wide">Vides</div>
                        <div className="text-2xl font-bold text-indigo-900 mt-1">{packagingOverview.emptyCrates}</div>
                        <div className="text-[10px] text-indigo-600">en stock</div>
                      </div>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100">
                        <Equal className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-[90px] text-center bg-gradient-to-br from-amber-100 to-indigo-100 rounded-xl py-3 px-2 border border-amber-200">
                        <div className="text-[11px] text-gray-800 font-semibold uppercase tracking-wide">Total</div>
                        <div className="text-2xl font-bold text-gray-900 mt-1">{packagingOverview.totalCrates}</div>
                        <div className="text-[10px] text-gray-600">emballages</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500 text-center italic">
                      Cageots : {packagingOverview.fullCrates} Remplis + {packagingOverview.emptyCrates} Vides = Total {packagingOverview.totalCrates} Emballages
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Rechercher un produit..."
              className="pl-10 rounded-xl border-gray-200"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              className="flex h-10 w-full sm:w-48 items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span>{categoryFilter === 'all' ? 'Toutes catégories' : categories.find(c => c.id === categoryFilter)?.name}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
            {isCategoryMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsCategoryMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                  <button
                    onClick={() => { handleCategoryChange('all'); setIsCategoryMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${categoryFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
                  >
                    Toutes catégories
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { handleCategoryChange(cat.id); setIsCategoryMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${categoryFilter === cat.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
              className="flex h-10 w-full sm:w-48 items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <span>{
                statusFilter === 'all' ? 'Tous les statuts' :
                  statusFilter === 'ok' ? 'En stock' :
                    statusFilter === 'low' ? 'Stock bas' : 'Rupture'
              }</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
            {isStatusMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsStatusMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                  {[
                    { id: 'all', label: 'Tous les statuts' },
                    { id: 'ok', label: 'En stock' },
                    { id: 'low', label: 'Stock bas' },
                    { id: 'out', label: 'Rupture' }
                  ].map(status => (
                    <button
                      key={status.id}
                      onClick={() => { handleStatusChange(status.id); setIsStatusMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${statusFilter === status.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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

        {/* Empty packaging transfer modal */}
        <EmptyPackagingTransferModal
          open={showTransferModal}
          onClose={() => setShowTransferModal(false)}
        />

        {/* Empty packaging reception checklist modal */}
        <EmptyPackagingReceptionModal
          open={!!selectedTransfer}
          onClose={() => { setSelectedTransfer(null); refetchTransfers(); }}
          transfer={selectedTransfer}
        />
          </>
        ) : (
          <CustomerPackagingTab products={products} />
        )}

        {/* Modale d'ajustement d'inventaire (emballages) */}
        <PackagingAdjustModal
          open={!!adjustingLocation}
          onClose={() => setAdjustingLocation(null)}
          location={adjustingLocation}
        />

        {/* Sélecteur d'emplacement pour admin sans location_id */}
        {isAdmin() && (
          <Dialog open={showLocationPicker} onOpenChange={setShowLocationPicker}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-orange-600" />
                  Choisir un emplacement à ajuster
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                {allLocations.filter(l => l.is_active !== false).map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setShowLocationPicker(false);
                      setAdjustingLocation({ id: loc.id, name: loc.name });
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all text-left"
                  >
                    {loc.type === 'store' ? (
                      <Store className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Warehouse className="w-5 h-5 text-amber-500" />
                    )}
                    <div>
                      <p className="font-semibold text-gray-800">{loc.name}</p>
                      <p className="text-xs text-gray-500">{loc.type === 'store' ? 'Magasin' : 'Entrepôt'}</p>
                    </div>
                  </button>
                ))}
                {allLocations.filter(l => l.is_active !== false).length === 0 && (
                  <p className="text-center text-gray-500 py-4">Aucun emplacement disponible</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}