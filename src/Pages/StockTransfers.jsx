import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight, Send, PackageCheck, RefreshCw, Search,
  Truck, CheckCircle2, ChevronRight, Filter, Minus, Plus,
  Trash2, X, Package
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import TransferReceptionModal from '@/components/stock/TransferReceptionModal';
import TransferDetailsModal from '@/components/stock/TransferDetailsModal';
import CategoryTabs from '@/components/pos/CategoryTabs';

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

const STATUS_MAP = {
  in_transit: { label: 'En Transit', color: 'bg-amber-100 text-amber-700', icon: Truck },
  received: { label: 'Réceptionné', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  completed: { label: 'Réceptionné', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function StockTransfers() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [toLocationId, setToLocationId] = useState('');
  const [fromLocationId, setFromLocationId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  const [viewingTransfer, setViewingTransfer] = useState(null);
  const [receivingTransfer, setReceivingTransfer] = useState(null);

  const { data: transfers = [], isLoading, refetch } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: () => fetchAPI('/stock-transfers'),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchAPI('/locations'),
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products-list'],
    queryFn: () => fetchAPI('/products'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchAPI('/categories?sort=order'),
  });

  // Filter destinations: exclude user's own location
  const destinationLocations = useMemo(() => {
    const myLocationId = user?.location_id || fromLocationId;
    return locations.filter(l => l.id !== myLocationId);
  }, [locations, user, fromLocationId]);

  const stats = useMemo(() => ({
    total: transfers.length,
    inTransit: transfers.filter(t => t.status === 'in_transit').length,
    completed: transfers.filter(t => t.status === 'completed' || t.status === 'received').length,
  }), [transfers]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      if (!product.track_stock) return false;
      const matchesCategory = !activeCategory || product.category_id === activeCategory;
      const matchesSearch = !searchQuery.trim() ||
        product.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, searchQuery, activeCategory]);

  const sendMut = useMutation({
    mutationFn: (data) => fetchAPI('/stock-transfers/send', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products-list'] });
      setCart([]);
      setShowCheckout(false);
      setToLocationId('');
      setFromLocationId('');
      setTransferNotes('');
      toast.success(`Transfert ${data.reference} expédié avec succès !`);
    },
    onError: (e) => toast.error(e.message),
  });

  const receiveMut = useMutation({
    mutationFn: ({ id, data, transferType }) => {
      const endpoint = transferType === 'empty_packaging'
        ? `/stock-transfers/${id}/receive-packaging`
        : `/stock-transfers/${id}/receive`;
      return fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products-list'] });
      queryClient.invalidateQueries({ queryKey: ['location-packaging-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pending-packaging-transfers'] });
      setReceivingTransfer(null);
      toast.success('Marchandise réceptionnée avec succès !');
    },
    onError: (e) => toast.error(e.message),
  });

  // ——— Cart handlers (POS-style: click to add +1) ———
  const addToCart = useCallback((product) => {
    if (product.track_stock && product.stock <= 0) return;

    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (product.track_stock && existing.quantity >= product.stock) return prev;
        return prev.map(i =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        stock: product.stock,
        track_stock: product.track_stock,
        image_url: product.image_url,
        quantity: 1,
        empty_packaging_qty: 0,
        empty_secondary_packaging_qty: 0,
      }];
    });
  }, []);

  const updateQuantity = useCallback((productId, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(i => i.id !== productId));
    } else {
      setCart(prev => prev.map(i => {
        if (i.id !== productId) return i;
        if (i.track_stock && newQty > i.stock) return i;
        return { ...i, quantity: newQty };
      }));
    }
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(i => i.id !== productId));
  }, []);

  const updatePackaging = useCallback((productId, field, value) => {
    const numVal = Math.max(0, parseInt(value, 10) || 0);
    setCart(prev => prev.map(i =>
      i.id === productId ? { ...i, [field]: numVal } : i
    ));
  }, []);

  const handleCheckout = (e) => {
    e.preventDefault();
    if (!cart.length) return toast.error('Ajoutez au moins un produit');
    
    if (user?.role === 'admin' && !user?.location_id && !fromLocationId) {
      return toast.error('Veuillez sélectionner une origine');
    }

    sendMut.mutate({
      from_location_id: fromLocationId || undefined,
      to_location_id: toLocationId,
      notes: transferNotes,
      items: cart.map(i => ({
        product_id: i.id,
        quantity: i.quantity,
        empty_packaging_qty: i.empty_packaging_qty || 0,
        empty_secondary_packaging_qty: i.empty_secondary_packaging_qty || 0,
      })),
    });
  };

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const getStockBadgeColor = (stock, minStock = 5) => {
    if (stock <= 0) return 'bg-red-500 text-white';
    if (stock <= minStock) return 'bg-orange-500 text-white';
    return 'bg-emerald-500 text-white';
  };

  return (
    <div className="fixed inset-0 lg:left-64 overflow-hidden bg-gradient-to-br from-gray-50 via-violet-50/30 to-purple-50/30 z-10">
      <div className="flex h-full overflow-hidden">

        {/* ═══════════════ LEFT: Products ═══════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white/50 backdrop-blur-sm">

          {/* Header */}
          <header className="bg-white/95 backdrop-blur-xl border-b border-gray-200 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-xl">
                  <ArrowLeftRight className="w-6 h-6 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-800">Transferts de Stock</h1>
                  <p className="text-[11px] text-gray-400 font-medium">Cliquez sur un produit pour l'ajouter au transfert</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher..."
                    className="pl-9 w-64 h-10 rounded-2xl border border-gray-200 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 bg-gray-50/50 text-sm transition-all"
                  />
                </div>
                <button
                  onClick={() => refetch()}
                  className="p-2.5 rounded-2xl hover:bg-gray-100 text-gray-400 transition-all active:scale-90"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </header>

          {/* Categories */}
          <div className="px-4 py-2 bg-gradient-to-b from-white to-gray-50/50 border-b border-gray-100">
            <CategoryTabs
              categories={categories}
              activeCategory={activeCategory}
              onSelect={setActiveCategory}
            />
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-10">
            {loadingProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                    <div className="w-full aspect-square rounded-xl bg-gray-200 mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-5 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <p className="text-lg">Aucun produit trouvé</p>
                <p className="text-sm">Essayez de modifier votre recherche</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find(c => c.id === product.id);
                  const effectiveStock = product.track_stock ? product.stock - (inCart?.quantity || 0) : Infinity;
                  return (
                    <div
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`relative flex flex-col rounded-2xl text-left transition-all duration-300 group cursor-pointer p-4 ${
                        (product.track_stock && effectiveStock <= 0)
                          ? 'bg-gray-50 opacity-60 cursor-not-allowed grayscale'
                          : 'bg-white border border-gray-100/50 hover:shadow-xl hover:shadow-violet-500/10 hover:-translate-y-1 active:scale-[0.98]'
                      }`}
                    >
                      {/* Stock badge */}
                      {product.track_stock && (
                        <div className={`absolute top-2 right-2 ${getStockBadgeColor(effectiveStock, product.min_stock)} px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm z-20 border border-white/20`}>
                          <Package className="w-2.5 h-2.5" />
                          {effectiveStock} {product.unit}
                        </div>
                      )}

                      {/* Cart quantity badge */}
                      {inCart && (
                        <div className="absolute top-2 left-2 bg-violet-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-20">
                          {inCart.quantity}
                        </div>
                      )}

                      {/* Product image */}
                      <div className="w-full aspect-square rounded-xl bg-[#F0F4FF] flex items-center justify-center overflow-hidden relative shadow-inner mb-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                        ) : (
                          <span className="text-4xl font-bold text-violet-200">{product.name.charAt(0)}</span>
                        )}
                        <div className="absolute inset-0 bg-violet-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      <div className="flex-1 flex flex-col justify-between">
                        <h3 className="font-bold text-gray-700 text-sm line-clamp-1 leading-snug group-hover:text-violet-600 transition-colors">
                          {product.name}
                        </h3>
                        <div className="flex items-center justify-end mt-1">
                          {(!product.track_stock || effectiveStock > 0) && (
                            <div className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-lg hover:bg-violet-700 active:scale-90">
                              <Plus className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </div>

                      {product.track_stock && effectiveStock <= 0 && (
                        <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
                          <span className="text-gray-500 font-medium">Rupture</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ———— History table below products ———— */}
            {transfers.length > 0 && (
              <div className="mt-8">
                <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-violet-600" />
                  Historique des Transferts
                </h2>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50">
                        <TableHead className="py-3 text-xs">Réf.</TableHead>
                        <TableHead className="text-xs">De</TableHead>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs">Vers</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-right text-xs w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map(t => {
                        const s = STATUS_MAP[t.status] || STATUS_MAP.in_transit;
                        const SIcon = s.icon;
                        return (
                          <TableRow key={t.id} className="hover:bg-gray-50/50 transition-colors">
                            <TableCell className="font-mono font-medium text-violet-700 text-xs">{t.reference}</TableCell>
                            <TableCell className="font-medium text-gray-900 text-xs">{t.from_loc?.name || '?'}</TableCell>
                            <TableCell><ChevronRight className="w-3 h-3 text-gray-300" /></TableCell>
                            <TableCell className="font-medium text-gray-900 text-xs">{t.to_loc?.name || '?'}</TableCell>
                            <TableCell>
                              <Badge className={`${s.color} border-0 gap-1 text-[10px]`}><SIcon className="w-3 h-3" /> {s.label}</Badge>
                            </TableCell>
                            <TableCell className="text-gray-500 text-xs">{new Date(t.shipped_at || t.created_at).toLocaleDateString('fr-FR')}</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setViewingTransfer(t)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 text-xs px-2">
                                Détails
                              </Button>
                              {t.status === 'in_transit' && (
                                <Button size="sm" onClick={() => setReceivingTransfer(t)} className="bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] gap-1 h-7 px-2">
                                  <PackageCheck className="w-3 h-3" /> Réceptionner
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ RIGHT: Transfer Cart ═══════════════ */}
        <div className="w-96 border-l border-gray-100 hidden lg:flex lg:flex-col bg-white overflow-hidden">
          <div className="h-full flex flex-col">

            {/* Cart Header */}
            <div className="p-4 border-b-2 border-dashed border-gray-300 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-violet-600" />
                    Transfert en cours
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {cartCount > 0 ? `${cartCount} article(s) sélectionné(s)` : 'Aucun article'}
                  </p>
                </div>
              </div>

              {/* Destination selector — always visible */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                {/* Admin origin selector */}
                {user?.role === 'admin' && !user?.location_id && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Origine *</label>
                    <select 
                      value={fromLocationId} 
                      onChange={e => setFromLocationId(e.target.value)}
                      className="flex h-9 w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm"
                    >
                      <option value="">Choisir l'origine...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Destinataire *</label>
                  <select 
                    value={toLocationId} 
                    onChange={e => setToLocationId(e.target.value)}
                    className="flex h-9 w-full rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-1.5 text-sm font-medium focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="">Choisir le destinataire...</option>
                    {destinationLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.type === 'store' ? 'Magasin' : 'Entrepôt'})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 px-6 text-center">
                  <div className="w-24 h-24 mb-4 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-100">
                    <Package className="w-12 h-12 opacity-30" />
                  </div>
                  <p className="text-sm font-bold text-gray-400">Panier vide</p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-[150px]">Cliquez sur les produits à transférer</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2 border-b border-gray-200 pb-1">
                    Articles à transférer
                  </div>
                  {cart.map((item) => (
                    <div key={item.id} className="text-xs border-b border-gray-100 pb-2">
                      <div className="font-bold text-gray-900 mb-1.5 flex justify-between items-start">
                        <span className="flex-1">{item.name}</span>
                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 ml-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex justify-between items-center pl-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center border border-gray-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.track_stock ? item.stock : undefined}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1) updateQuantity(item.id, val);
                            }}
                            className="w-12 text-center font-mono font-semibold text-base border border-gray-200 rounded-lg bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 outline-none py-0.5"
                          />
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.track_stock && item.quantity >= item.stock}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center border border-gray-300 disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-gray-500">
                          {item.track_stock ? `Stock: ${item.stock - item.quantity}` : ''}
                        </span>
                      </div>
                      {/* Emballages vides */}
                      <div className="flex gap-2 mt-1.5 pl-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">Bout.vides:</span>
                          <input
                            type="number"
                            min="0"
                            value={item.empty_packaging_qty}
                            onChange={(e) => updatePackaging(item.id, 'empty_packaging_qty', e.target.value)}
                            className="w-10 text-center font-mono text-[11px] border border-gray-200 rounded bg-white py-0.5"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">Casiers:</span>
                          <input
                            type="number"
                            min="0"
                            value={item.empty_secondary_packaging_qty}
                            onChange={(e) => updatePackaging(item.id, 'empty_secondary_packaging_qty', e.target.value)}
                            className="w-10 text-center font-mono text-[11px] border border-gray-200 rounded bg-white py-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t-2 border-dashed border-gray-300 bg-gray-50 space-y-2">
                <div className="border-t-2 border-gray-800 pt-2 mb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm uppercase">Total articles</span>
                    <span className="font-bold text-xl text-violet-700">{cartCount}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || !toLocationId || sendMut.isPending}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl h-12 text-base font-bold shadow-lg disabled:opacity-50"
                >
                  <Send className="w-5 h-5 mr-2" />
                  {sendMut.isPending ? 'Expédition...' : 'Expédier le Transfert'}
                </Button>

                <Button
                  onClick={() => { setCart([]); }}
                  variant="ghost"
                  className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Vider le panier
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <TransferReceptionModal
        open={!!receivingTransfer}
        onClose={() => setReceivingTransfer(null)}
        transfer={receivingTransfer}
        onConfirm={(id, payload) => receiveMut.mutate({ id, data: payload.data, transferType: payload.transferType })}
        isPending={receiveMut.isPending}
      />

      <TransferDetailsModal
        open={!!viewingTransfer}
        onClose={() => setViewingTransfer(null)}
        transfer={viewingTransfer}
      />
    </div>
  );
}
