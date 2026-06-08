import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    ShoppingCart, Search, Calendar, TrendingUp,
    Package, Filter, RefreshCw, Inbox, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ProductGrid from '@/components/purchases/ProductGrid';
import QuickAddModal from '@/components/purchases/QuickAddModal';
import PurchaseCart from '@/components/purchases/PurchaseCart';
import CheckoutModal from '@/components/purchases/CheckoutModal';
import PackagingVerificationModal from '@/components/purchases/PackagingVerificationModal';
import GroupedPurchaseReceipt from '@/components/purchases/GroupedPurchaseReceipt';
import PurchaseHistoryTable from '@/components/purchases/PurchaseHistoryTable';
import CategoryTabs from '@/components/pos/CategoryTabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

export default function Purchases() {
    const { formatCurrency } = useCurrency();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [activeCategory, setActiveCategory] = useState(null);
    const [cart, setCart] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showVerification, setShowVerification] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastPurchaseGroup, setLastPurchaseGroup] = useState(null);
    const [receptionTarget, setReceptionTarget] = useState(null);

    const queryClient = useQueryClient();

    // Fetch purchases (individual)
    const { data: purchases = [], isLoading: loadingPurchases, isRefetching: refetchingPurchases, refetch: refetchPurchases } = useQuery({
        queryKey: ['purchases'],
        queryFn: () => base44.entities.Purchase.list()
    });

    // Fetch purchase groups
    const { data: purchaseGroups = [], isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
        queryKey: ['purchase-groups'],
        queryFn: () => base44.entities.PurchaseGroup.list()
    });

    // Fetch locations (for displaying destination names)
    const { data: locations = [] } = useQuery({
        queryKey: ['locations'],
        queryFn: () => base44.entities.Location.list()
    });

    // Fetch products
    const { data: products = [], isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
        queryKey: ['products'],
        queryFn: () => base44.entities.Product.list()
    });

    // Fetch categories
    const { data: categories = [], isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
        queryKey: ['categories'],
        queryFn: () => base44.entities.Category.list('order')
    });

    const handleRefresh = () => {
        refetchPurchases();
        refetchGroups();
        refetchProducts();
        refetchCategories();
    };

    const isRefreshing = loadingPurchases || refetchingPurchases || loadingGroups || loadingProducts || loadingCategories;

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

    // Pending receptions: groups waiting to be received at the current user's location
    // Admin sees all pending; stock_manager sees only their location's pending orders.
    const pendingReceptions = useMemo(() => {
        if (!user) return [];
        const isAdmin = user.role === 'admin';
        return purchaseGroups.filter(g => {
            if (g.reception_status !== 'pending') return false;
            if (isAdmin) return true;
            return g.location_id && user.location_id && g.location_id === user.location_id;
        });
    }, [purchaseGroups, user]);

    const locationsById = useMemo(() => {
        const m = {};
        locations.forEach(l => { m[l.id] = l; });
        return m;
    }, [locations]);

    const openReceptionChecklist = (group) => {
        setReceptionTarget(group);
        setShowVerification(true);
    };

    const closeReceptionChecklist = () => {
        setShowVerification(false);
        setReceptionTarget(null);
    };

    // Filtered products
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            // Only show products that track stock
            if (!product.track_stock) return false;

            const matchesCategory = !activeCategory || product.category_id === activeCategory;
            const matchesSearch = !searchQuery.trim() ||
                product.name?.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, searchQuery, activeCategory]);

    const createGroupMutation = useMutation({
        mutationFn: async (data) => {
            const response = await fetch('/api/purchase-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed to create purchase group');
            return response.json();
        },
        onSuccess: (purchaseGroup) => {
            console.log('Purchase group created:', purchaseGroup);
            queryClient.invalidateQueries({ queryKey: ['purchase-groups'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            setLastPurchaseGroup(purchaseGroup);
            setCart([]);
            setShowCheckout(false);
            // Show receipt directly. The reception checklist is now triggered by the recipient
            // from the "Réceptions en attente" section (or, for non-packaging orders,
            // the order is already validated and stock is added).
            setShowReceipt(true);
        },
        onError: (error) => {
            console.error('Error creating purchase group:', error);
            toast.error(`Erreur: ${error.message}`);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async ({ id, type }) => {
            const endpoint = type === 'group' ? 'purchase-groups' : 'purchases';
            const response = await fetch(`/api/${endpoint}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-groups'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Suppression effectuée avec succès');
        },
        onError: (error) => {
            toast.error(`Erreur lors de la suppression: ${error.message}`);
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
        toast('Vider le panier ?', {
            action: {
                label: 'Vider',
                onClick: () => {
                    setCart([]);
                    toast.success('Panier vidé');
                }
            },
        });
    }, []);

    const handleProductClick = useCallback((product) => {
        setSelectedProduct(product);
    }, []);

    const handleCheckout = useCallback(() => {
        if (cart.length === 0) {
            toast.info('Le panier est vide');
            return;
        }
        setShowCheckout(true);
    }, [cart]);

    const handleConfirmCheckout = useCallback((data) => {
        createGroupMutation.mutate(data);
    }, [createGroupMutation]);

    const handleDelete = useCallback((id, type) => {
        const message = type === 'group'
            ? 'Supprimer cet approvisionnement groupé ?'
            : 'Supprimer cet achat ?';
        const description = 'Le stock sera ajusté en conséquence.';

        toast(message, {
            description,
            action: {
                label: 'Supprimer',
                onClick: () => deleteMutation.mutate({ id, type })
            }
        });
    }, [deleteMutation]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-green-50/30 to-emerald-50/30 p-6">
            <div className="max-w-[1800px] mx-auto">
                <div className="flex gap-6 items-start">
                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <ShoppingCart className="w-7 h-7 text-green-600" />
                                    Achats & Approvisionnement
                                </h1>
                                <p className="text-gray-500">Cliquez sur un produit pour l'ajouter au panier</p>
                            </div>

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

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <Card className="border-0 shadow-sm">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Total Achats</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total)}</h3>
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
                                                <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats.today)}</h3>
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
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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

                        {/* Pending Receptions */}
                        {pendingReceptions.length > 0 && (
                            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5">
                                <h2 className="text-lg font-bold text-amber-800 mb-3 flex items-center gap-2">
                                    <Inbox className="w-5 h-5" />
                                    Réceptions en attente ({pendingReceptions.length})
                                </h2>
                                <p className="text-sm text-amber-700 mb-4">
                                    Commandes en transit destinées à votre emplacement. Ouvrez la checklist pour vérifier les emballages et valider la réception.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {pendingReceptions.map(g => {
                                        const destination = locationsById[g.location_id];
                                        return (
                                            <div
                                                key={g.id}
                                                className="bg-white rounded-xl border border-amber-200 p-4 flex items-start justify-between gap-3"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                                            {g.reference}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                                            <Inbox className="w-3 h-3" />
                                                            En transit
                                                        </span>
                                                    </div>
                                                    <div className="font-semibold text-gray-800 truncate">
                                                        {g.supplier_name || 'Fournisseur inconnu'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {destination ? destination.name : 'Destination inconnue'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {g.items?.length || 0} produits • {formatCurrency(Number(g.total_amount) || 0)}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => openReceptionChecklist(g)}
                                                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                                                >
                                                    Réceptionner
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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
                    <div className="sticky top-6 h-[calc(100vh-3rem)] w-[340px] shrink-0">
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

                <PackagingVerificationModal
                    key={receptionTarget?.id || (showVerification ? 'open' : 'closed')}
                    open={showVerification}
                    onClose={closeReceptionChecklist}
                    purchaseGroup={receptionTarget || lastPurchaseGroup}
                    onVerified={() => {
                        setShowVerification(false);
                        if (receptionTarget) {
                            // After reception: refresh stock, locations, and the list of pending groups
                            queryClient.invalidateQueries({ queryKey: ['purchase-groups'] });
                            queryClient.invalidateQueries({ queryKey: ['products'] });
                            queryClient.invalidateQueries({ queryKey: ['locations'] });
                            setReceptionTarget(null);
                            toast.success('Réception validée. Le stock a été ajouté.');
                        } else {
                            setShowReceipt(true);
                        }
                    }}
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
