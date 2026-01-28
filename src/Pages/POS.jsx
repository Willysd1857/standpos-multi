import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Moon, Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import CategoryTabs from '@/components/pos/CategoryTabs';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import PaymentModal from '@/components/pos/PaymentModal';
import ReceiptModal from '@/components/pos/ReceiptModal';


export default function POS() {
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);

  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: allProducts = [], isLoading: loadingProducts, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true })
  });

  // Filter out ingredients from POS (handle both boolean and integer values from SQLite)
  const products = allProducts.filter(p => {
    // Exclude if is_ingredient is truthy (true, 1, or any truthy value)
    return !p.is_ingredient && p.is_ingredient !== 1;
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  // Removed transaction resumption logic (Pending orders deprecated)

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
        amount_paid: data.amount_paid || data.total,
        amount_due: data.amount_due || 0,
        payment_status: data.payment_status || 'paid',
        status: data.status || 'validated',
        created_date: data.created_date
      });

      return transaction;
    },
    onSuccess: (transaction, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // Merge returned transaction with submission data to ensure specific fields like phone_number 
      // are immediately available for the receipt, even if the backend response is restricted or lagged.
      setLastTransaction({ ...transaction, ...variables });
      setCart([]);
      setShowPayment(false);
      setShowReceipt(true);
    },
    onError: (error) => {
      console.error("Transaction error:", error);
      alert(`Erreur lors de l'enregistrement: ${error.message}`);
    }
  });

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesCategory = !activeCategory || product.category_id === activeCategory;
      const matchesSearch = !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);

  const addToCart = useCallback((product) => {
    if (product.stock <= 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const updateQuantity = useCallback((productId, newQuantity) => {
    if (newQuantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== productId));
      return;
    }

    // Access products from scope or pass it? 
    // Ideally we should rely on the prev state or pass stock info in the cart item
    // Here we rely on products from closure. Since products might update, this is tricky.
    // But products don't change often. We should add products to ref or dependency.
    // Actually, cart item should store max stock.
    // For now, adding products to dependency.

    // Better: check stock from the item itself if we stored it?
    // We already stored {...product} in cart, so item.stock exists.

    setCart(prev => {
      // Find product in prev or use closure?
      // Using function update to access current state.
      // We can optimize by assuming item in cart has stock info.
      return prev.map(item => {
        if (item.id === productId) {
          if (newQuantity > item.stock) return item;
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
    });
  }, []); // Removing products dependency to avoid recreation if products list refetches. Assuming cart items have stock.

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  }, []);

  const handleCheckout = useCallback(async (paymentData) => {
    const items = cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total: item.price * item.quantity
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const vipCharge = paymentData.is_vip ? (Number(settings?.vip_charge) || 0) : 0;
    const total = subtotal + vipCharge;

    await createTransactionMutation.mutateAsync({
      items,
      total,
      payment_method: paymentData.payment_method,
      partner_name: paymentData.customer_name,
      phone_number: paymentData.phone_number,
      transaction_ref: paymentData.transaction_ref,
      table_number: paymentData.table_number,
      is_vip: paymentData.is_vip,
      amount_paid: paymentData.amount_paid,
      amount_due: paymentData.amount_due,
      payment_status: paymentData.payment_status,
      status: paymentData.status || 'validated',
      created_date: paymentData.created_date,
      customer_id: paymentData.customer_id,
      customer_name: paymentData.customer_name
    });
  }, [cart, createTransactionMutation, settings]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);

  return (
    <div className="flex h-[100vh] overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30">
      {/* Main area - Products */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white/95 backdrop-blur-xl border-b border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ rotate: -10, scale: 0.9 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-xl shadow-blue-500/40"
              >
                <Moon className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">Moonlight</h1>
                <p className="text-[10px] text-gray-600 font-medium">Point de Vente</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  className="pl-9 w-64 h-9 rounded-xl border-2 border-gray-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 bg-white shadow-sm text-sm"
                />
              </div>

              <button
                onClick={() => refetch()}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-all hover:shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
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

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {loadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
            <ProductGrid products={filteredProducts} onAddToCart={addToCart} />
          )}
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="w-96 border-l border-gray-100 p-4 hidden lg:block">
        <Cart
          items={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onCheckout={() => setShowPayment(true)}
          onClear={() => setCart([])}
        />
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
          <span className="text-xl font-bold">{cartTotal.toLocaleString()} Ar</span>
        </motion.button>
      )}

      {/* Payment modal */}
      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        items={cart}
        total={cartTotal}
        onConfirm={handleCheckout}
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