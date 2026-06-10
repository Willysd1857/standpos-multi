import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Search, RotateCcw, AlertTriangle, User, Calendar, Clock, Wine, Boxes, Container, Trash2, FileWarning, Warehouse } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { base44, fetchAPI } from '@/api/base44Client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function CustomerPackagingTab({ products }) {
  const { formatCurrency } = useCurrency();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [returningConsignment, setReturningConsignment] = useState(null);
  const [returnBottles, setReturnBottles] = useState('');
  const [returnCrates, setReturnCrates] = useState('');
  const [isBreakageOpen, setIsBreakageOpen] = useState(false);
  const [breakageType, setBreakageType] = useState('bottle');
  const [breakageProductId, setBreakageProductId] = useState('');
  const [breakageQuantity, setBreakageQuantity] = useState('');
  const [breakageReason, setBreakageReason] = useState('');
  const [breakageLocationId, setBreakageLocationId] = useState('');

  const needsLocationPicker = isAdmin() && !user?.location_id;

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchAPI('/locations'),
    enabled: needsLocationPicker,
  });

  // Fetch detailed consignments instead of summary
  const { data: consignments = [], isLoading } = useQuery({
    queryKey: ['customer-packaging-consignments-detailed'],
    queryFn: () => base44.entities.Packaging.getConsignments({ entity_type: 'customer' })
  });

  const returnMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Packaging.returnConsignment(data.id, data);
    },
    onSuccess: (data) => {
      toast.success(`Retour validé avec succès. Remboursé : ${formatCurrency(data.refundedAmount)}`);
      queryClient.invalidateQueries(['customer-packaging-consignments-detailed']);
      queryClient.invalidateQueries(['packaging_history']);
      queryClient.invalidateQueries(['packaging_consignments']);
      queryClient.invalidateQueries(['products']);
      setReturningConsignment(null);
      setReturnBottles('');
      setReturnCrates('');
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors du retour');
    }
  });

  const markLostMutation = useMutation({
    mutationFn: async (id) => {
      return base44.entities.Packaging.markLost(id);
    },
    onSuccess: () => {
      toast.success("Consigne marquée comme perdue");
      queryClient.invalidateQueries(['customer-packaging-consignments-detailed']);
      queryClient.invalidateQueries(['packaging_history']);
      queryClient.invalidateQueries(['packaging_consignments']);
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur');
    }
  });

  const breakageMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Packaging.declareBreakage(data);
    },
    onSuccess: (data) => {
      const loss = data?.financialLoss || 0;
      toast.success(
        loss > 0
          ? `Casse enregistrée. Perte financière : ${formatCurrency(loss)}`
          : 'Casse enregistrée avec succès.'
      );
      queryClient.invalidateQueries(['products']);
      queryClient.invalidateQueries(['packaging_history']);
      queryClient.invalidateQueries(['customer-packaging-consignments-detailed']);
      setIsBreakageOpen(false);
      setBreakageProductId('');
      setBreakageQuantity('');
      setBreakageReason('');
      setBreakageType('bottle');
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la déclaration de casse');
    }
  });

  const handleReturnClick = (consignment) => {
    setReturningConsignment(consignment);
    setReturnBottles(consignment.empty_packaging_qty || 0);
    setReturnCrates(consignment.empty_secondary_packaging_qty || 0);
  };

  const submitReturn = () => {
    if (!returningConsignment) return;

    if (Number(returnBottles) > returningConsignment.empty_packaging_qty) {
        toast.error(`Vous ne pouvez pas retourner plus de ${returningConsignment.empty_packaging_qty} bouteilles`);
        return;
    }
    if (Number(returnCrates) > returningConsignment.empty_secondary_packaging_qty) {
        toast.error(`Vous ne pouvez pas retourner plus de ${returningConsignment.empty_secondary_packaging_qty} cageots`);
        return;
    }

    returnMutation.mutate({
      id: returningConsignment.id,
      return_bottles: Number(returnBottles) || 0,
      return_crates: Number(returnCrates) || 0
    });
  };

  const openBreakageModal = () => {
    setIsBreakageOpen(true);
    setBreakageType('bottle');
    setBreakageProductId('');
    setBreakageQuantity('');
    setBreakageReason('');
    setBreakageLocationId('');
  };

  const submitBreakage = () => {
    if (!breakageProductId) {
      toast.error('Veuillez sélectionner un produit');
      return;
    }
    if (needsLocationPicker && !breakageLocationId) {
      toast.error('Veuillez sélectionner un emplacement');
      return;
    }
    const qty = Number(breakageQuantity) || 0;
    if (qty <= 0) {
      toast.error('Veuillez saisir une quantité supérieure à 0');
      return;
    }
    const product = products.find(p => p.id === breakageProductId);
    if (!product) {
      toast.error('Produit introuvable');
      return;
    }
    const available = breakageType === 'bottle'
      ? Number(product.empty_packaging_qty) || 0
      : Number(product.empty_secondary_packaging_qty) || 0;
    if (qty > available) {
      toast.error(`Stock insuffisant : seulement ${available} ${breakageType === 'bottle' ? 'bouteilles' : 'cageots'} vides disponibles.`);
      return;
    }
    breakageMutation.mutate({
      product_id: breakageProductId,
      broken_bottles: breakageType === 'bottle' ? qty : 0,
      broken_crates: breakageType === 'crate' ? qty : 0,
      reason: breakageReason || 'Déclaration de casse',
      location_id: needsLocationPicker ? breakageLocationId : user?.location_id
    });
  };

  // Filter consignments
  const pendingConsignments = consignments.filter(c => c.status === 'pending' || c.status === 'partial');
  const items = pendingConsignments.filter(item => {
    const matchName = item.product_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchClient = item.entity_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchName || matchClient;
  });

  const getProductDepositValue = (productId, type) => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;
    return type === 'bottle' ? (product.bottle_deposit_price || 0) : (product.crate_deposit_price || 0);
  };

  // Summary statistics
  const summary = useMemo(() => {
    let emptyBottles = 0;
    let emptyCrates = 0;
    let fullBottles = 0;
    let fullCrates = 0;
    let fullBottlesInStock = 0;
    let fullCratesInStock = 0;
    let fullBottlesAtClients = 0;
    let fullCratesAtClients = 0;

    // Emballages PLEINS en stock (entrepôt) : chaque unité en stock = 1 bouteille pleine
    // Cages pleines en stock : floor(stock / bottles_per_crate)
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

    // Emballages PLEINS chez les clients (consignations en attente)
    pendingConsignments.forEach(c => {
      const b = Number(c.empty_packaging_qty) || 0;
      const cr = Number(c.empty_secondary_packaging_qty) || 0;
      fullBottlesAtClients += b;
      fullCratesAtClients += cr;
      fullBottles += b;
      fullCrates += cr;
    });

    // Emballages VIDES en stock
    products.filter(p => p.has_packaging).forEach(p => {
      emptyBottles += Number(p.empty_packaging_qty) || 0;
      emptyCrates += Number(p.empty_secondary_packaging_qty) || 0;
    });

    return {
      emptyBottles,
      emptyCrates,
      fullBottles,
      fullCrates,
      fullBottlesInStock,
      fullCratesInStock,
      fullBottlesAtClients,
      fullCratesAtClients
    };
  }, [products, pendingConsignments]);

  const packagingProducts = useMemo(
    () => products.filter(p =>
      p.has_packaging ||
      p.packaging_type_id ||
      p.secondary_packaging_type_id ||
      Number(p.bottle_deposit_price) > 0 ||
      Number(p.crate_deposit_price) > 0
    ),
    [products]
  );

  const fallbackProducts = useMemo(
    () => products.filter(p => !packagingProducts.some(pp => pp.id === p.id)),
    [products, packagingProducts]
  );

  const selectableProducts = useMemo(
    () => packagingProducts.length > 0 ? packagingProducts : products,
    [packagingProducts, products]
  );

  const selectedBreakageProduct = useMemo(
    () => products.find(p => p.id === breakageProductId) || null,
    [products, breakageProductId]
  );

  const selectedBreakageMax = selectedBreakageProduct
    ? (breakageType === 'bottle'
        ? Number(selectedBreakageProduct.empty_packaging_qty) || 0
        : Number(selectedBreakageProduct.empty_secondary_packaging_qty) || 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-br from-white via-orange-50/30 to-rose-50/30">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-orange-600" />
                Vue d'ensemble du parc d'emballages
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">Suivi en temps réel des emballages vides, pleins et des pertes.</p>
            </div>
            <Button
              onClick={openBreakageModal}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Déclarer des emballages cassés
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Emballages Vides */}
            <div className="bg-white rounded-2xl border border-purple-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Container className="w-4 h-4 text-purple-700" />
                </div>
                <h4 className="font-semibold text-purple-900 text-sm">Emballages Vides (en stock)</h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-50/60 rounded-xl p-3 border border-purple-100">
                  <div className="flex items-center gap-1.5 text-xs text-purple-700 font-medium">
                    <Wine className="w-3.5 h-3.5" />
                    Bouteilles
                  </div>
                  <div className="text-2xl font-bold text-purple-900 mt-1">{summary.emptyBottles}</div>
                  <div className="text-[10px] text-purple-600 uppercase tracking-wide">unités</div>
                </div>
                <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-100">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-700 font-medium">
                    <Boxes className="w-3.5 h-3.5" />
                    Cageots
                  </div>
                  <div className="text-2xl font-bold text-indigo-900 mt-1">{summary.emptyCrates}</div>
                  <div className="text-[10px] text-indigo-600 uppercase tracking-wide">unités</div>
                </div>
              </div>
            </div>

            {/* Emballages Pleins (chez les clients) */}
            <div className="bg-white rounded-2xl border border-orange-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <FileWarning className="w-4 h-4 text-orange-700" />
                </div>
                <h4 className="font-semibold text-orange-900 text-sm">Emballages Pleins (stock + clients)</h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-100">
                  <div className="flex items-center gap-1.5 text-xs text-orange-700 font-medium">
                    <Wine className="w-3.5 h-3.5" />
                    Bouteilles
                  </div>
                  <div className="text-2xl font-bold text-orange-900 mt-1">{summary.fullBottles}</div>
                  <div className="text-[10px] text-orange-600 flex items-center justify-center gap-1.5 mt-0.5">
                    <span title="En stock" className="inline-flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      {summary.fullBottlesInStock} stock
                    </span>
                    <span className="text-orange-300">·</span>
                    <span title="Chez clients" className="inline-flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {summary.fullBottlesAtClients} clients
                    </span>
                  </div>
                </div>
                <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100">
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                    <Boxes className="w-3.5 h-3.5" />
                    Cageots
                  </div>
                  <div className="text-2xl font-bold text-amber-900 mt-1">{summary.fullCrates}</div>
                  <div className="text-[10px] text-amber-600 flex items-center justify-center gap-1.5 mt-0.5">
                    <span title="En stock" className="inline-flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {summary.fullCratesInStock} stock
                    </span>
                    <span className="text-amber-300">·</span>
                    <span title="Chez clients" className="inline-flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {summary.fullCratesAtClients} clients
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <div className="flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un produit ou un client..."
            className="pl-10 rounded-xl border-gray-200"
          />
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Date Consigne</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead className="text-center">Bouteilles à rendre</TableHead>
                <TableHead className="text-center">Cageots à rendre</TableHead>
                <TableHead className="text-right">Valeur Caution</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    Aucune consigne client en attente
                  </TableCell>
                </TableRow>
              ) : (
                items.map(consignment => {
                  const bDeposit = getProductDepositValue(consignment.product_id, 'bottle');
                  const cDeposit = getProductDepositValue(consignment.product_id, 'crate');
                  const totalValue = (consignment.empty_packaging_qty * bDeposit) + (consignment.empty_secondary_packaging_qty * cDeposit);

                  return (
                    <TableRow key={consignment.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-700">
                            {format(new Date(consignment.created_at), 'dd MMM yyyy', { locale: fr })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {format(new Date(consignment.created_at), 'HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-indigo-400" />
                          <span className="font-semibold text-gray-800">{consignment.entity_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-gray-700">{consignment.product_name}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {consignment.empty_packaging_qty}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                          {consignment.empty_secondary_packaging_qty}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-gray-800">
                        {formatCurrency(totalValue)}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white text-orange-600 border-orange-200 hover:bg-orange-50"
                          onClick={() => handleReturnClick(consignment)}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Retour
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            if(window.confirm('Voulez-vous marquer cette consigne comme PERDUE ? Cela créera une perte officielle.')) {
                              markLostMutation.mutate(consignment.id);
                            }
                          }}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Return Modal Overlay */}
      <AnimatePresence>
        {returningConsignment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 bg-orange-50/50">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-orange-600" />
                  Retour Emballages - {returningConsignment.product_name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">Client: {returningConsignment.entity_name}</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Bouteilles à retourner</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={returningConsignment.empty_packaging_qty}
                        value={returnBottles}
                        onChange={(e) => setReturnBottles(e.target.value)}
                        className="rounded-xl border-gray-300 font-bold"
                      />
                      <span className="text-sm text-gray-500">/ {returningConsignment.empty_packaging_qty}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Cageots à retourner</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={returningConsignment.empty_secondary_packaging_qty}
                        value={returnCrates}
                        onChange={(e) => setReturnCrates(e.target.value)}
                        className="rounded-xl border-gray-300 font-bold"
                      />
                      <span className="text-sm text-gray-500">/ {returningConsignment.empty_secondary_packaging_qty}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-3 rounded-xl border border-green-100 mt-4 flex justify-between items-center">
                  <span className="text-sm font-semibold text-green-800">Montant à rembourser :</span>
                  <span className="text-lg font-bold text-green-700">
                    {formatCurrency(
                      ((Number(returnBottles) || 0) * getProductDepositValue(returningConsignment.product_id, 'bottle')) +
                      ((Number(returnCrates) || 0) * getProductDepositValue(returningConsignment.product_id, 'crate'))
                    )}
                  </span>
                </div>
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setReturningConsignment(null)} className="rounded-xl" disabled={returnMutation.isPending}>
                  Annuler
                </Button>
                <Button
                  onClick={submitReturn}
                  className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
                  disabled={returnMutation.isPending}
                >
                  {returnMutation.isPending ? 'En cours...' : 'Valider le retour'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Breakage Declaration Modal */}
      <AnimatePresence>
        {isBreakageOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 bg-red-50/60">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-600" />
                  Déclaration de casse d'emballages
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  La quantité saisie sera déduite du stock des emballages vides et enregistrée dans le journal d'audit.
                </p>
              </div>
              <div className="p-5 space-y-4">
                {needsLocationPicker && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Emplacement *</Label>
                    <select
                      value={breakageLocationId}
                      onChange={(e) => setBreakageLocationId(e.target.value)}
                      className="flex h-10 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 cursor-pointer"
                    >
                      <option value="">— Sélectionner un emplacement —</option>
                      {allLocations.filter(l => l.is_active !== false).map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.type === 'store' ? 'Magasin' : 'Entrepôt'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Type d'emballage</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => { setBreakageType('bottle'); setBreakageProductId(''); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        breakageType === 'bottle'
                          ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Wine className="w-4 h-4" />
                      <span className="font-semibold text-sm">Bouteilles</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBreakageType('crate'); setBreakageProductId(''); }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        breakageType === 'crate'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Boxes className="w-4 h-4" />
                      <span className="font-semibold text-sm">Cageots</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Produit concerné *</Label>
                  <select
                    value={breakageProductId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBreakageProductId(v);
                    }}
                    className="flex h-10 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 cursor-pointer"
                    disabled={selectableProducts.length === 0}
                  >
                    <option value="">
                      {selectableProducts.length === 0 ? 'Aucun produit disponible' : '— Sélectionner un produit —'}
                    </option>
                    {packagingProducts.length > 0 && (
                      <optgroup label="🍾 Produits avec emballage">
                        {packagingProducts.map(p => {
                          const stock = breakageType === 'bottle'
                            ? (Number(p.empty_packaging_qty) || 0)
                            : (Number(p.empty_secondary_packaging_qty) || 0);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({stock} dispo)
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    {fallbackProducts.length > 0 && (
                      <optgroup label={packagingProducts.length === 0 ? "⚠️ Aucun produit n'a d'emballage activé" : 'Autres produits (sans emballage)'}>
                        {fallbackProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {packagingProducts.length === 0 && products.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      💡 Activez l'option "Emballage" sur vos produits (Paramètres → Produits) pour un meilleur suivi.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">
                    Quantité cassée {selectedBreakageProduct && (
                      <span className="text-xs text-gray-500 font-normal">
                        (max: {selectedBreakageMax})
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={selectedBreakageMax || undefined}
                    value={breakageQuantity}
                    onChange={(e) => setBreakageQuantity(e.target.value)}
                    placeholder="0"
                    className="rounded-xl border-gray-300 font-bold"
                    disabled={!breakageProductId}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Raison / Motif (optionnel)</Label>
                  <Input
                    value={breakageReason}
                    onChange={(e) => setBreakageReason(e.target.value)}
                    placeholder="Ex: Chute lors du transport, accident client..."
                    className="rounded-xl border-gray-300"
                  />
                </div>

                {selectedBreakageProduct && Number(breakageQuantity) > 0 && (
                  <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-red-800">Perte financière estimée :</span>
                      <span className="text-lg font-bold text-red-700">
                        {formatCurrency(
                          (Number(breakageQuantity) || 0) *
                          (breakageType === 'bottle'
                            ? (selectedBreakageProduct.bottle_deposit_price || 0)
                            : (selectedBreakageProduct.crate_deposit_price || 0))
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-red-600 mt-1">
                      Basée sur la valeur de caution unitaire. La perte officielle sera calculée côté serveur.
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsBreakageOpen(false)} className="rounded-xl" disabled={breakageMutation.isPending}>
                  Annuler
                </Button>
                <Button
                  onClick={submitBreakage}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  disabled={breakageMutation.isPending}
                >
                  {breakageMutation.isPending ? 'Enregistrement...' : 'Confirmer la casse'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
