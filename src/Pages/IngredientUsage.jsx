import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, ChefHat, History, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import UsageForm from '@/components/ingredient-usage/UsageForm';
import UsageHistory from '@/components/ingredient-usage/UsageHistory';

export default function IngredientUsage() {
    const [showForm, setShowForm] = useState(false);
    const [selectedUsage, setSelectedUsage] = useState(null);
    const queryClient = useQueryClient();

    const { data: usages = [], isLoading } = useQuery({
        queryKey: ['ingredient-usages'],
        queryFn: async () => {
            const res = await fetch('http://localhost:3001/api/ingredient-usages');
            if (!res.ok) throw new Error('Failed to fetch');
            return res.json();
        }
    });

    const { data: ingredients = [] } = useQuery({
        queryKey: ['ingredients'],
        queryFn: async () => {
            const res = await fetch('http://localhost:3001/api/products');
            if (!res.ok) throw new Error('Failed to fetch');
            const products = await res.json();
            return products.filter(p => p.is_ingredient === 1 || p.is_ingredient === true);
        }
    });

    const createUsageMutation = useMutation({
        mutationFn: async (data) => {
            console.log('🚀 Sending request to backend:', data);
            const res = await fetch('http://localhost:3001/api/ingredient-usages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            console.log('📡 Response status:', res.status);

            if (!res.ok) {
                const error = await res.json();
                console.error('❌ Backend error:', error);
                throw new Error(error.error || 'Failed to create usage');
            }

            const result = await res.json();
            console.log('✅ Backend response:', result);
            return result;
        },
        onSuccess: (data) => {
            console.log('🎉 Usage created successfully:', data);
            queryClient.invalidateQueries({ queryKey: ['ingredient-usages'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['ingredients'] });
            setShowForm(false);
            alert(`✅ Utilisation enregistrée avec succès!\nRéférence: ${data.reference || 'N/A'}`);
        },
        onError: (error) => {
            console.error('💥 Mutation error:', error);
            alert(`❌ Erreur lors de l'enregistrement:\n${error.message}`);
        }
    });

    const deleteUsageMutation = useMutation({
        mutationFn: async (id) => {
            const res = await fetch(`http://localhost:3001/api/ingredient-usages/${id}`, {
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
            alert('✅ Utilisation supprimée avec succès!');
        },
        onError: (error) => {
            console.error('❌ Delete error:', error);
            alert(`❌ Erreur lors de la suppression:\n${error.message}`);
        }
    });

    const stats = {
        total: usages.length,
        today: usages.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString()).length,
        ingredients: ingredients.length
    };

    const handleDelete = (id) => {
        if (window.confirm('Supprimer cette utilisation ? Le stock sera restauré.')) {
            deleteUsageMutation.mutate(id);
        }
    };

    const handleView = (usage) => {
        setSelectedUsage(usage);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-red-50/30 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <ChefHat className="w-7 h-7 text-orange-600" />
                            Utilisation des Ingrédients
                        </h1>
                        <p className="text-gray-500">Enregistrez l'utilisation de vos ingrédients</p>
                    </div>
                    <Button onClick={() => setShowForm(true)} className="bg-orange-600 hover:bg-orange-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvelle Utilisation
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="border-0 shadow-sm">
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
                        <Card className="border-0 shadow-sm">
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
                        <Card className="border-0 shadow-sm">
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

                <UsageHistory usages={usages} isLoading={isLoading} onDelete={handleDelete} onView={handleView} />

                <UsageForm
                    open={showForm}
                    onClose={() => setShowForm(false)}
                    ingredients={ingredients}
                    onSubmit={(data) => createUsageMutation.mutate(data)}
                    isSubmitting={createUsageMutation.isPending}
                />
            </div>
        </div>
    );
}
