import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Moon, Search, RefreshCw, Calendar, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import CategoryTabs from '@/components/pos/CategoryTabs';
import ProductGrid from '@/components/pos/ProductGrid';
import ProductTable from '@/components/pos/ProductTable';
import Cart from '@/components/pos/Cart';
import PaymentModal from '@/components/pos/PaymentModal';
import ReceiptModal from '@/components/pos/ReceiptModal';
import { useCurrency } from '@/contexts/CurrencyContext';
import { toast } from 'sonner';


import { formatAmount } from '@/lib/utils';

const HeaderClock = ({ formatDateTime }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatDateTime(time)}</>;
};

export default function POS() {
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [activeTransactionId, setActiveTransactionId] = useState(null);
  const [isHolding, setIsHolding] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('posViewMode') || 'grid');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('posViewMode', mode);
  };

  // New: Local state to store the "live" items for ALL open tables
  // This allows instant switching like "folders"
  const [localCarts, setLocalCarts] = useState({});

  // Currency context
  const { formatCurrency: formatCurrencyWithSymbol, formatDateTime } = useCurrency();

  const queryClient = useQueryClient();

  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  // Filter out categories hidden in POS
  const categories = useMemo(() => allCategories.filter(c => !c.hidden_in_pos), [allCategories]);

  const { data: allProducts = [], isLoading: loadingProducts, refetch } = useQuery({
    queryKey: ['products', { is_active: true }],
    queryFn: () => base44.entities.Product.filter({ is_active: true })
  });

  // Fetch all recipes for stock calculation of recipe products
  const { data: allRecipes = [] } = useQuery({
    queryKey: ['recipes-all'],
    queryFn: () => fetch('/api/products/recipes/all').then(r => r.json()),
    staleTime: 30000
  });

  // Filter out raw materials from POS; compute available stock for recipe products
  const products = useMemo(() => {
    return allProducts
      .filter(p => p.product_type !== 'raw_material' && !p.is_ingredient && p.is_ingredient !== 1)
      .map(p => {
        if (p.product_type !== 'recipe') return p;
        // Compute available portions = min over all ingredients of floor(mat_stock / consumption_per_unit)
        const recipeIngredients = allRecipes.filter(r => r.product_id === p.id);
        if (recipeIngredients.length === 0) return { ...p, track_stock: true, stock: 0 };
        const portions = recipeIngredients.map(r => {
          const consumptionPerUnit = r.quantity_per_batch / r.batch_size;
          return consumptionPerUnit > 0 ? Math.floor(r.raw_material_stock / consumptionPerUnit) : Infinity;
        });
        const computedStock = Math.min(...portions);
        return { ...p, stock: computedStock, track_stock: true };
      });
  }, [allProducts, allRecipes]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const { data: transactions = [], refetch: refetchTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list()
  });

  const pendingOrders = useMemo(() => {
    return transactions.filter(t => t.status === 'pending');
  }, [transactions]);

  const activeOrder = useMemo(() => {
    return pendingOrders.find(o => o.id === activeTransactionId);
  }, [pendingOrders, activeTransactionId]);

  // Sync localCarts with pending orders from database
  // This runs when component mounts or when pendingOrders/products change
  useEffect(() => {
    if (pendingOrders.length > 0 && products.length > 0) {
      setLocalCarts(prev => {
        const nextCarts = { ...prev };
        let hasChanges = false;

        pendingOrders.forEach(order => {
          // Only sync if not already in local carts OR if local cart is empty/not started
          // This prevents overwriting unsaved local changes
          const existing = prev[order.id];

          // Safely parse items - handle empty strings and invalid JSON
          let dbItems = [];
          try {
            if (order.items && typeof order.items === 'string' && order.items.trim()) {
              dbItems = JSON.parse(order.items);
            } else if (Array.isArray(order.items)) {
              dbItems = order.items;
            }
          } catch (e) {
            console.warn(`Failed to parse items for order ${order.id}:`, e);
            dbItems = [];
          }

          if (!existing || (existing.items.length === 0 && dbItems.length > 0)) {
            const enrichedItems = dbItems.map(dbItem => {
              const product = products.find(p => p.id === dbItem.product_id);
              if (!product) return null;
              return {
                id: product.id,
                name: product.name,
                price: product.price,
                unit: product.unit,
                stock: product.stock,
                quantity: dbItem.quantity,
                category_id: product.category_id,
                image_url: product.image_url,
                min_stock: product.min_stock,
                track_stock: product.track_stock
              };
            }).filter(Boolean);

            if (enrichedItems.length > 0 || !existing) {
              nextCarts[order.id] = {
                items: enrichedItems,
                is_vip: order.is_vip || false,
                partner_name: order.partner_name || '',
                phone_number: order.phone_number || ''
              };
              hasChanges = true;
            }
          }
        });

        return hasChanges ? nextCarts : prev;
      });
    }
  }, [pendingOrders, products]); // Re-sync when either changes

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimerRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Corrected carts extraction logic
  const cart = useMemo(() => {
    if (!activeTransactionId) return [];
    const entry = localCarts[activeTransactionId];
    return Array.isArray(entry) ? entry : (entry?.items || []);
  }, [localCarts, activeTransactionId]);

  const isVip = useMemo(() => {
    if (!activeTransactionId) return false;
    const entry = localCarts[activeTransactionId];
    return entry?.is_vip || false;
  }, [localCarts, activeTransactionId]);

  const initialCustomerInfo = useMemo(() => {
    if (!activeTransactionId) return { name: '', phone: '' };
    const entry = localCarts[activeTransactionId];
    return {
      name: entry?.partner_name || '',
      phone: entry?.phone_number || ''
    };
  }, [localCarts, activeTransactionId]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const createTransactionMutation = useMutation({
    mutationFn: async (data) => {
      // Backend will generate reference automatically in the new format
      const transaction = await base44.entities.Transaction.create({
        type: 'vente',
        items: data.items,
        total_amount: data.total,
        payment_method: data.payment_method,
        partner_name: data.partner_name || null,
        phone_number: data.phone_number || null,
        transaction_ref: data.transaction_ref || null,
        table_number: data.table_number || null,
        is_vip: data.is_vip || false,
        amount_paid: data.amount_paid !== undefined ? data.amount_paid : data.total,
        amount_due: data.amount_due !== undefined ? data.amount_due : 0,
        payment_status: data.payment_status || 'paid',
        status: data.status || 'validated',
        created_date: data.created_date,
        customer_id: data.customer_id || null,
        customer_name: data.customer_name || null,
        amount_given: data.amount_given || 0,
        include_consignment: data.include_consignment,
        consignment_total: data.consignment_total
      });

      return transaction;
    },
    onSuccess: (transaction, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['recipes-all'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });

      // ONLY clear and show receipt if the transaction is VALIDATED (finished)
      if (transaction.status !== 'pending') {
        setLastTransaction(transaction); // Use server result directly
        setActiveTransactionId(null);
        setShowPayment(false);
        setShowReceipt(true);
      }
    },
    onError: (error) => {
      console.error("Transaction error:", error);
      toast.error(`Erreur lors de l'enregistrement: ${error.message}`);
    }
  });

  const updateTransactionMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Transaction.update(id, data);
    },
    onSuccess: (data, variables) => {
      // Optimistically update the transactions list in cache
      queryClient.setQueryData(['transactions'], (old) => {
        return old?.map(t => t.id === variables.id ? { ...t, ...data } : t);
      });
      setIsHolding(false);

      // If we are validating a previously pending transaction, show receipt
      if (variables.data.status && variables.data.status !== 'pending') {
        setLastTransaction(data); // data is the server result
        setActiveTransactionId(null);
        setShowPayment(false);
        setShowReceipt(true);
      }
    }
  });

  // Debounce timer for auto-save
  const saveTimerRef = useRef({});

  // Update cart locally (instant, with debounced save)
  const updateLocalCart = useCallback((id, newItems) => {
    // Update UI immediately (optimistic update)
    setLocalCarts(prev => {
      const current = prev[id] || { items: [], is_vip: false };
      return {
        ...prev,
        [id]: {
          ...current,
          items: newItems
        }
      };
    });

    // Clear existing timer
    if (saveTimerRef.current[id]) {
      clearTimeout(saveTimerRef.current[id]);
    }

    // Debounce save with very short delay (100ms for near-instant feel)
    saveTimerRef.current[id] = setTimeout(() => {
      const total = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Convert frontend items to backend structure
      const backendItems = newItems.map(item => ({
        product_id: item.id,
        product_name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.price,
        total: item.price * item.quantity
      }));

      updateTransactionMutation.mutate({
        id: id,
        data: {
          items: backendItems,
          total_amount: total
        }
      });
    }, 100); // Very short delay - UI feels instant but data is saved
  }, [updateTransactionMutation]);

  const hiddenCategoryIds = useMemo(() => new Set(allCategories.filter(c => c.hidden_in_pos).map(c => c.id)), [allCategories]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        // Hide products from categories hidden in POS
        if (product.category_id && hiddenCategoryIds.has(product.category_id)) return false;
        const matchesCategory = !activeCategory || product.category_id === activeCategory;
        const matchesSearch = !searchQuery ||
          product.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .map(product => {
        if (!product.track_stock) return product;
        const cartItem = cart.find(c => c.id === product.id);
        if (!cartItem) return product;
        return { ...product, stock: product.stock - cartItem.quantity };
      });
  }, [products, activeCategory, searchQuery, cart, hiddenCategoryIds]);

  const createPendingOrder = async () => {
    try {
      const newTransaction = await createTransactionMutation.mutateAsync({
        type: 'vente',
        items: [],
        total: 0,
        status: 'pending'
      });

      setLocalCarts(prev => ({
        ...prev,
        [newTransaction.id]: { items: [], is_vip: false }
      }));

      setActiveTransactionId(newTransaction.id);
      return newTransaction;
    } catch (error) {
      console.error("Create order error:", error);
    }
  };

  const addToCart = useCallback(async (product, isPlusButton = false) => {
    // Only check stock if product tracks stock
    if (product.track_stock && product.stock <= 0) return;

    let transactionId = activeTransactionId;

    if (!transactionId) {
      const newTx = await createPendingOrder();
      if (newTx) {
        transactionId = newTx.id;
      } else {
        return;
      }
    }

    const cartData = localCarts[transactionId] || { items: [], is_vip: false };
    const currentItems = Array.isArray(cartData) ? cartData : (cartData.items || []);

    const existing = currentItems.find(item => item.id === product.id);
    let newItems;

    if (existing) {
      // Only check stock limit if product tracks stock
      if (product.track_stock && existing.quantity >= product.stock) return;
      newItems = currentItems.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      newItems = [...currentItems, { ...product, quantity: 1 }];
    }

    updateLocalCart(transactionId, newItems);
  }, [activeTransactionId, localCarts, updateLocalCart, createPendingOrder]);

  const updateQuantity = useCallback((productId, newQuantity) => {
    if (!activeTransactionId) return;

    const cartData = localCarts[activeTransactionId] || { items: [], is_vip: false };
    const currentItems = Array.isArray(cartData) ? cartData : cartData.items;

    let newItems;

    if (newQuantity <= 0) {
      newItems = currentItems.filter(item => item.id !== productId);
    } else {
      newItems = currentItems.map(item => {
        if (item.id === productId) {
          // Only check stock limit if product tracks stock
          if (item.track_stock && newQuantity > item.stock) return item;
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
    }

    updateLocalCart(activeTransactionId, newItems);
  }, [activeTransactionId, localCarts, updateLocalCart]);

  const removeFromCart = useCallback((productId) => {
    if (!activeTransactionId) return;
    const cartData = localCarts[activeTransactionId] || { items: [], is_vip: false };
    const currentItems = Array.isArray(cartData) ? cartData : cartData.items;

    const newItems = currentItems.filter(item => item.id !== productId);
    updateLocalCart(activeTransactionId, newItems);
  }, [activeTransactionId, localCarts, updateLocalCart]);

  const handleCheckout = useCallback(async (paymentData) => {
    // Convert frontend items to backend structure
    const backendItems = cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.price,
      cost_price: item.cost_price || 0,
      total: item.price * item.quantity
    }));

    if (paymentData.include_consignment) {
      cart.forEach(cartItem => {
        // Find product to reliably get packaging details
        const product = products.find(p => p.id === cartItem.id);
        if (product && product.has_packaging && product.bottle_deposit_price > 0) {
          backendItems.push({
            product_id: 'consigne',
            product_name: `Consigne (${product.name})`,
            unit: 'Unité',
            quantity: cartItem.quantity,
            unit_price: Number(product.bottle_deposit_price),
            cost_price: 0,
            total: cartItem.quantity * Number(product.bottle_deposit_price)
          });
        }
      });
    }

    const subtotal = backendItems.reduce((sum, item) => sum + item.total, 0);
    const vipCharge = paymentData.is_vip ? (Number(settings?.vip_charge) || 0) : 0;
    // consignmentTotal is now included in subtotal
    const total = subtotal + vipCharge;

    const transactionData = {
      items: backendItems,
      total_amount: total,
      total: total,
      payment_method: paymentData.payment_method,
      partner_name: paymentData.customer_name,
      phone_number: paymentData.phone_number,
      transaction_ref: paymentData.transaction_ref,
      table_number: paymentData.table_number || activeOrder?.table_number,
      is_vip: paymentData.is_vip,
      amount_paid: paymentData.amount_paid,
      amount_due: paymentData.amount_due,
      payment_status: paymentData.payment_status,
      status: paymentData.status || 'validated',
      created_date: paymentData.created_date,
      customer_id: paymentData.customer_id,
      customer_name: paymentData.customer_name,
      amount_given: paymentData.amount_given,
      include_consignment: paymentData.include_consignment,
      consignment_total: paymentData.consignment_total,
      returned_packaging: paymentData.returned_packaging
    };

    if (activeTransactionId) {
      await updateTransactionMutation.mutateAsync({
        id: activeTransactionId,
        data: transactionData
      });
      // Success logic is now handled in mutation.onSuccess
      setLocalCarts(prev => {
        const next = { ...prev };
        delete next[activeTransactionId];
        return next;
      });
    } else {
      await createTransactionMutation.mutateAsync(transactionData);
    }
  }, [cart, createTransactionMutation, updateTransactionMutation, settings, activeTransactionId, activeOrder]);

  const handleHold = async () => {
    if (!activeTransactionId || cart.length === 0) return;

    setIsHolding(true);
    try {
      const items = cart.map(item => ({
        product_id: item.id,
        product_name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.price,
        cost_price: item.cost_price || 0,
        total: item.price * item.quantity
      }));
      const total = items.reduce((sum, item) => sum + item.total, 0);

      await updateTransactionMutation.mutateAsync({
        id: activeTransactionId,
        data: {
          items,
          total_amount: total,
          status: 'pending'
        }
      });
      setActiveTransactionId(null);
    } catch (error) {
      console.error("Hold error:", error);
    } finally {
      setIsHolding(false);
    }
  };




  return (
    <div className="fixed inset-0 lg:left-64 overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 z-10">
      {/* Main content wrapper - Products + Cart */}
      <div className="flex h-full overflow-hidden">
        {/* Left: Main area - Products */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white/50 backdrop-blur-sm">
          {/* Header */}
          <header className="bg-white/95 backdrop-blur-xl border-b border-gray-200 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
                    <img src="/standpos-logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                    StandPOS
                  </h1>
                  <p className="text-[10px] text-gray-400 font-medium">La caisse qui vous met debout</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Current Date/Time Display */}
                {/* Center: Current Date/Time Display */}
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50/50 rounded-2xl border border-blue-100/50 shadow-sm">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-bold text-blue-600">
                    <HeaderClock formatDateTime={formatDateTime} />
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher..."
                      className="pl-9 w-64 h-10 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-gray-50/50 text-sm transition-all"
                    />
                  </div>

                  <button
                    onClick={() => refetch()}
                    className="p-2.5 rounded-2xl hover:bg-gray-100 text-gray-400 transition-all active:scale-90"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <div className="flex bg-gray-100 rounded-lg p-1 ml-1">
                    <button
                      onClick={() => handleViewModeChange('grid')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow font-bold text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      title="Vue Grille"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleViewModeChange('table')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow font-bold text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      title="Vue Liste"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
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

          {/* Products grid area - Increased padding to allow full view of items when scrolling */}
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
            ) : viewMode === 'table' ? (
              <ProductTable products={filteredProducts} onAddToCart={addToCart} />
            ) : (
              <ProductGrid products={filteredProducts} onAddToCart={addToCart} />
            )}
          </div>
        </div>

        {/* Right: Cart sidebar - Always visible on large screens */}
        <div className="w-96 border-l border-gray-100 p-4 pb-32 hidden lg:flex lg:flex-col bg-white overflow-hidden">
          <Cart
            items={cart}
            tableNumber={activeOrder?.table_number}
            isVip={isVip}
            vipCharge={Number(settings?.vip_charge) || 0}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
            onCheckout={() => setShowPayment(true)}
            onClear={() => {
              if (!activeTransactionId) return;
              toast("Annuler cette commande ?", {
                action: {
                  label: "Annuler",
                  onClick: () => {
                    base44.entities.Transaction.delete(activeTransactionId).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['transactions'] });
                      setActiveTransactionId(null);
                      setLocalCarts(prev => {
                        const next = { ...prev };
                        delete next[activeTransactionId];
                        return next;
                      });
                      toast.success("Commande annulée");
                    });
                  }
                }
              });
            }}
            onHold={handleHold}
            isHolding={isHolding}
          />
        </div>
      </div>

      {/* Mobile cart button */}
      {cart.length > 0 && (
        <motion.button
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          onClick={() => setShowPayment(true)}
          className="lg:hidden fixed bottom-4 left-4 right-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-between"
        >
          <span className="font-semibold">{cart.length} article(s)</span>
          <span className="text-xl font-bold">{formatCurrencyWithSymbol(cartTotal)}</span>
        </motion.button>
      )}

      {/* Payment modal */}
      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        items={cart}
        total={cartTotal}
        onConfirm={handleCheckout}
        initialTableNumber={activeOrder?.table_number}
        initialIsVip={isVip}
        initialCustomerName={initialCustomerInfo.name}
        initialPhoneNumber={initialCustomerInfo.phone}
      />

      {/* Receipt modal */}
      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        transaction={lastTransaction}
      />

    </div >
  );
}
