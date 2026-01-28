import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    ShoppingCart, Search, Calendar, TrendingUp,
    Package, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import ProductGrid from '@/components/purchases/ProductGrid';
import QuickAddModal from '@/components/purchases/QuickAddModal';
import PurchaseCart from '@/components/purchases/PurchaseCart';
import CheckoutModal from '@/components/purchases/CheckoutModal';
import GroupedPurchaseReceipt from '@/components/purchases/GroupedPurchaseReceipt';
import PurchaseHistoryTable from '@/components/purchases/PurchaseHistoryTable';
import CategoryTabs from '@/components/pos/CategoryTabs';

export default function Purchases() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [activeCategory, setActiveCategory] = useState(null);
    const [cart, setCart] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastPurchaseGroup, setLastPurchaseGroup] = useState(null);

    const queryClient = useQueryClient();

    // Fetch purchases (individual)
    const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
        queryKey: ['purchases'],
        queryFn: async () => {
            const response = await fetch('http://localhost:3001/api/purchases');
            if (!response.ok) throw new Error('Failed to fetch purchases');
            return response.json();
        }
    });

    // Fetch purchase groups
    const { data: purchaseGroups = [] } = useQuery({
        queryKey: ['purchase-groups'],
        queryFn: async () => {
            const response = await fetch('http://localhost:3001/api/purchase-groups');
            if (!response.ok) throw new Error('Failed to fetch purchase groups');
            return response.json();
        }
    });

    // Fetch products
    const { data: products = [], isLoading: loadingProducts } = useQuery({
        queryKey: ['products'],
        queryFn: () => base44.entities.Product.list()
    });

    // Fetch categories
    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => base44.entities.Category.list('order')
    });

    // Combined purchases for history (individual + groups)
    const allPurchases = useMemo(() => {
        const individual = purchases.map(p => ({ ...p, type: 'individual' }));
        const groups = purchaseGroups.map(g => ({
            ...g,
            type: 'group',
            product_name: `${g.items?.length || 0} produits`,
            quantity: g.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
            unit_price: '-'
        }));
        return [...individual, ...groups].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );
    }, [purchases, purchaseGroups]);

    // Stats
    const stats = useMemo(() => {
        const individualTotal = purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
        const groupTotal = purchaseGroups.reduce((sum, g) => sum + (Number(g.total_amount) || 0), 0);
        const total = individualTotal + groupTotal;

        const today = allPurchases
            .filter(p => new Date(p.date || p.created_at).toDateString() === new Date().toDateString())
            .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);

        return { total, today };
    }, [purchases, purchaseGroups, allPurchases]);

    // Filtered products
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesCategory = !activeCategory || product.category_id === activeCategory;
            const matchesSearch = !searchQuery.trim() ||
                product.name?.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, searchQuery, activeCategory]);

    // Create group mutation
    const createGroupMutation = useMutation({
        mutationFn: async (data) => {
            const response = await fetch('http://localhost:3001/api/purchase-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed to create purchase group');
            return response.json();
        },
        onSuccess: (purchaseGroup) => {
            queryClient.invalidateQueries({ queryKey: ['purchase-groups'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            setLastPurchaseGroup(purchaseGroup);
            setCart([]);
            setShowCheckout(false);
            setShowReceipt(true);
        },
        onError: (error) => {
            console.error('Error creating purchase group:', error);
            alert(`Erreur: ${error.message}`);
        }
    });

    // Delete mutation (works for both individual and groups)
    const deleteMutation = useMutation({
        mutationFn: async ({ id, type }) => {
            const endpoint = type === 'group' ? 'purchase-groups' : 'purchases';
            const response = await fetch(`http://localhost:3001/api/${endpoint}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-groups'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
        }
    });

    // Cart handlers
    const handleAddToCart = useCallback((item) => {
        setCart(prev => {
            const existing = prev.find(i => i.product_id === item.product_id);
            if (existing) {
                return prev.map(i =>
                    i.product_id === item.product_id
                        ? { ...i, quantity: i.quantity + item.quantity, unit_price: item.unit_price }
                        : i
                );
            }
            return [...prev, item];
        });
    }, []);

    const handleUpdateCartItem = useCallback((productId, updates) => {
        setCart(prev => prev.map(item =>
            item.product_id === productId ? { ...item, ...updates } : item
        ));
    }, []);

    const handleRemoveFromCart = useCallback((productId) => {
        setCart(prev => prev.filter(item => item.product_id !== productId));
    }, []);

    const handleClearCart = useCallback(() => {
        if (window.confirm('Vider le panier ?')) {
            setCart([]);
        }
    }, []);

    const handleProductClick = useCallback((product) => {
        setSelectedProduct(product);
    }, []);

    const handleCheckout = useCallback(() => {
        if (cart.length === 0) {
            alert('Le panier est vide');
            return;
        }
        setShowCheckout(true);
    }, [cart]);

    const handleConfirmCheckout = useCallback((data) => {
        createGroupMutation.mutate(data);
    }, [createGroupMutation]);

    const handleDelete = useCallback((id, type) => {
        const message = type === 'group'
            ? 'Supprimer cet approvisionnement groupé ? Le stock sera ajusté en conséquence.'
            : 'Supprimer cet achat ? Le stock sera ajusté en conséquence.';

        if (window.confirm(message)) {
            deleteMutation.mutate({ id, type });
        }
    }, [deleteMutation]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-green-50/30 to-emerald-50/30 p-6">
            <div className="max-w-[1800px] mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                    {/* Main content */}
                    <div className="space-y-6">
                        {/* Header */}
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <ShoppingCart className="w-7 h-7 text-green-600" />
                                Achats & Approvisionnement
                            </h1>
                            <p className="text-gray-500">Cliquez sur un produit pour l'ajouter au panier</p>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <Card className="border-0 shadow-sm">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Total Achats</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()} Ar</h3>
                                            </div>
                                            <div className="p-3 bg-green-100 rounded-xl">
                                                <TrendingUp className="w-6 h-6 text-green-600" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                <Card className="border-0 shadow-sm">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Achats du Jour</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{stats.today.toLocaleString()} Ar</h3>
                                            </div>
                                            <div className="p-3 bg-emerald-100 rounded-xl">
                                                <Calendar className="w-6 h-6 text-emerald-600" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                <Card className="border-0 shadow-sm">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Nombre d'Achats</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{allPurchases.length}</h3>
                                            </div>
                                            <div className="p-3 bg-blue-100 rounded-xl">
                                                <Package className="w-6 h-6 text-blue-600" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>

                        {/* Search and Filters */}
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Rechercher un produit..."
                                    className="pl-10 rounded-xl bg-white border-gray-200"
                                />
                            </div>

                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                                <CategoryTabs
                                    categories={categories}
                                    activeCategory={activeCategory}
                                    onSelect={setActiveCategory}
                                />
                            </div>
                        </div>

                        {/* Products Grid */}
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5 text-green-600" />
                                Produits disponibles
                            </h2>
                            <ProductGrid
                                products={filteredProducts}
                                onProductClick={handleProductClick}
                                isLoading={loadingProducts}
                            />
                        </div>

                        {/* Purchase History */}
                        <div className="pt-6">
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Filter className="w-5 h-5 text-green-600" />
                                Historique des approvisionnements
                            </h2>
                            <PurchaseHistoryTable
                                purchases={allPurchases}
                                onDelete={handleDelete}
                                isLoading={loadingPurchases}
                            />
                        </div>
                    </div>

                    {/* Sidebar - Cart */}
                    <div className="lg:sticky lg:top-6 h-[calc(100vh-3rem)]">
                        <PurchaseCart
                            items={cart}
                            onUpdateItem={handleUpdateCartItem}
                            onRemoveItem={handleRemoveFromCart}
                            onCheckout={handleCheckout}
                            onClear={handleClearCart}
                        />
                    </div>
                </div>

                {/* Modals */}
                <QuickAddModal
                    open={!!selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    product={selectedProduct}
                    onAdd={handleAddToCart}
                />

                <CheckoutModal
                    open={showCheckout}
                    onClose={() => setShowCheckout(false)}
                    items={cart}
                    onConfirm={handleConfirmCheckout}
                    isLoading={createGroupMutation.isPending}
                />

                <GroupedPurchaseReceipt
                    open={showReceipt}
                    onClose={() => setShowReceipt(false)}
                    purchaseGroup={lastPurchaseGroup}
                />
            </div>
        </div>
    );
}
