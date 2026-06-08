import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, ChefHat, History, TrendingDown, RefreshCw, Package, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import UsageHistory from '@/components/ingredient-usage/UsageHistory';
import IngredientGrid from '@/components/ingredient-usage/IngredientGrid';
import QuickAddCard from '@/components/ingredient-usage/QuickAddCard';
import CategoryTabs from '@/components/pos/CategoryTabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAppDate } from '@/hooks/useAppDate';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { base44 } from '@/api/base44Client';

export default function IngredientUsage() {
    const [selectedUsage, setSelectedUsage] = useState(null);
    const [selectedIngredient, setSelectedIngredient] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [alertMessage, setAlertMessage] = useState(null);
    const quickAddRef = useRef(null);
    const { formatDate } = useAppDate();
    const queryClient = useQueryClient();

    const { data: usages = [], isLoading: loadingUsages, isRefetching: refetchingUsages, refetch: refetchUsages } = useQuery({
        queryKey: ['ingredient-usages'],
        queryFn: () => base44.entities.IngredientUsage.list()
    });

    const { data: ingredients = [], isLoading: loadingIngredients, refetch: refetchIngredients } = useQuery({
        queryKey: ['ingredients'],
        queryFn: async () => {
            const products = await base44.entities.Product.list();
            return products.filter(p => p.product_type === 'raw_material' || p.is_ingredient === 1 || p.is_ingredient === true);
        }
    });

    const { data: categories = [], isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
        queryKey: ['categories'],
        queryFn: () => base44.entities.Category.list('order')
    });

    const createUsageMutation = useMutation({
        mutationFn: (data) => base44.entities.IngredientUsage.create(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['ingredient-usages'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['ingredients'] });
            setAlertMessage({
                title: 'Succès',
                message: `✅ Utilisation enregistrée avec succès!\nRéférence: ${data.reference || 'N/A'}`
            });
        },
        onError: (error) => {
            console.error('Mutation error:', error);
            setAlertMessage({
                title: 'Erreur',
                message: `❌ Erreur lors de l'enregistrement:\n${error.message}`
            });
        }
    });

    const deleteUsageMutation = useMutation({
        mutationFn: async (id) => {
            const res = await fetch(`/api/ingredient-usages/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete usage');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ingredient-usages'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['ingredients'] });
            setAlertMessage({
                title: 'Succès',
                message: '✅ Utilisation supprimée avec succès!'
            });
        },
        onError: (error) => {
            console.error('❌ Delete error:', error);
            setAlertMessage({
                title: 'Erreur',
                message: `❌ Erreur lors de la suppression:\n${error.message}`
            });
        }
    });

    const stats = {
        total: usages.length,
        today: usages.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString()).length,
        ingredients: ingredients.length
    };

    const filteredIngredients = ingredients.filter(ing => {
        const matchesCategory = !activeCategory || ing.category_id === activeCategory;
        const matchesSearch = !searchQuery.trim() || ing.name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleDelete = (id) => {
        setConfirmDeleteId(id);
    };

    const confirmDelete = () => {
        if (confirmDeleteId) {
            deleteUsageMutation.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
        }
    };

    const handleView = (usage) => {
        setSelectedUsage(usage);
    };

    const handleRefresh = () => {
        refetchUsages();
        refetchIngredients();
        refetchCategories();
    };

    const handleIngredientClick = (ingredient) => {
        setSelectedIngredient(ingredient);
        // Add ingredient to quick add card
        quickAddRef.current?.addIngredient(ingredient);
        // Auto-scroll to quick add card on mobile
        if (window.innerWidth < 1024) {
            document.getElementById('quick-add-card')?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const isRefreshing = loadingUsages || refetchingUsages || loadingIngredients || loadingCategories;
    const isLoading = loadingUsages && usages.length === 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-red-50/30 p-6">
            <div className="max-w-[1800px] mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                    {/* Main content */}
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <ChefHat className="w-7 h-7 text-orange-600" />
                                    Utilisation des Ingrédients
                                </h1>
                                <p className="text-gray-500">Cliquez sur un ingrédient pour l'ajouter</p>
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
                                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Total Utilisations</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3>
                                            </div>
                                            <div className="p-3 bg-orange-100 rounded-xl">
                                                <History className="w-6 h-6 text-orange-600" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Aujourd'hui</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{stats.today}</h3>
                                            </div>
                                            <div className="p-3 bg-blue-100 rounded-xl">
                                                <TrendingDown className="w-6 h-6 text-blue-600" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-500 mb-1">Ingrédients Disponibles</p>
                                                <h3 className="text-2xl font-bold text-gray-900">{stats.ingredients}</h3>
                                            </div>
                                            <div className="p-3 bg-green-100 rounded-xl">
                                                <ChefHat className="w-6 h-6 text-green-600" />
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
                                    placeholder="Rechercher un ingrédient..."
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

                        {/* Ingredients Grid */}
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5 text-orange-600" />
                                Ingrédients disponibles
                            </h2>
                            <IngredientGrid
                                ingredients={filteredIngredients}
                                onIngredientClick={handleIngredientClick}
                                isLoading={loadingIngredients}
                            />
                        </div>

                        {/* History */}
                        <div className="pt-6">
                            <UsageHistory
                                usages={usages}
                                isLoading={isLoading}
                                onDelete={handleDelete}
                                onView={handleView}
                            />
                        </div>
                    </div>

                    {/* Sidebar - Quick Add */}
                    <div id="quick-add-card" className="lg:sticky lg:top-6 h-[calc(100vh-3rem)]">
                        <QuickAddCard
                            ref={quickAddRef}
                            ingredients={ingredients}
                            onSubmit={(data) => createUsageMutation.mutate(data)}
                            isSubmitting={createUsageMutation.isPending}
                        />
                    </div>
                </div>

                {/* Details Modal */}
                <Dialog open={!!selectedUsage} onOpenChange={(open) => !open && setSelectedUsage(null)}>
                    <DialogContent className="sm:max-w-lg bg-white">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <History className="w-5 h-5 text-orange-600" />
                                Détails de l'utilisation
                            </DialogTitle>
                        </DialogHeader>

                        {selectedUsage && (
                            <div className="space-y-6 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs font-medium text-gray-500 uppercase">Référence</p>
                                        <Badge variant="outline" className="mt-1 bg-orange-50 text-orange-700 border-orange-200">
                                            {selectedUsage.reference}
                                        </Badge>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-gray-500 uppercase">Date & Heure</p>
                                        <p className="text-sm font-semibold mt-1">
                                            {formatDate(selectedUsage.created_at, 'dd MMMM yyyy HH:mm')}
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <ChefHat className="w-4 h-4 text-orange-600" />
                                        Ingrédients utilisés
                                    </h4>
                                    <div className="space-y-3">
                                        {selectedUsage.ingredients?.map((ing, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                <div>
                                                    <p className="font-bold text-gray-900">{ing.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        Stock: <span className="line-through">{ing.stock_before} {ing.unit}</span> → <span className="font-semibold text-orange-600">{ing.stock_after} {ing.unit}</span>
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-lg font-black text-orange-600">-{ing.quantity} {ing.unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedUsage.notes && (
                                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                        <p className="text-xs font-medium text-blue-700 uppercase mb-1">Notes / Observations</p>
                                        <p className="text-sm text-blue-900 whitespace-pre-wrap">{selectedUsage.notes}</p>
                                    </div>
                                )}

                                <div className="flex justify-end pt-2">
                                    <Button onClick={() => setSelectedUsage(null)} variant="outline" className="rounded-xl">
                                        Fermer
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Confirm Delete Alert */}
                <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
                    <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer l'utilisation ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Cette action est irréversible. Le stock des ingrédients sera restauré aux niveaux précédents.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
                                Supprimer
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Info / Error Alert */}
                <AlertDialog open={!!alertMessage} onOpenChange={(open) => !open && setAlertMessage(null)}>
                    <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                            <AlertDialogTitle>{alertMessage?.title}</AlertDialogTitle>
                            <AlertDialogDescription className="whitespace-pre-wrap">
                                {alertMessage?.message}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl">OK</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
