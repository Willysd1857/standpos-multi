import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Landmark, Briefcase, Calculator } from 'lucide-react';

export default function GeneralFinancialStatus() {
    const { formatCurrency } = useCurrency();

    const { data, isLoading, error } = useQuery({
        queryKey: ['bi-financial-status'],
        queryFn: () => base44.entities.BIReports.getFinancialStatus(),
    });

    if (error) return <div className="text-red-500">Erreur de chargement: {error.message}</div>;

    const patrimoineData = [
        { name: 'Valeur Stock (Produits)', value: data?.stockValue || 0, color: '#3b82f6' },
        { name: 'Valeur Emballages', value: data?.packagingValue || 0, color: '#10b981' },
        { name: 'Créances Clients (À encaisser)', value: data?.totalClientDebt || 0, color: '#f59e0b' },
    ];

    const debtsData = [
        { name: 'Dettes Fournisseurs', value: data?.totalSupplierDebt || 0, color: '#ef4444' }
    ];

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Situation Générale & Bilan</h2>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-[400px] col-span-1 md:col-span-3 rounded-2xl" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-blue-100 p-4 rounded-2xl">
                                    <Briefcase className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Actif (Ce qu'on possède)</p>
                                    <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(data?.actif || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-red-100 p-4 rounded-2xl">
                                    <Calculator className="w-8 h-8 text-red-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Passif (Ce qu'on doit)</p>
                                    <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(data?.passif || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`shadow-sm border-none text-white ${(data?.patrimoineNet || 0) >= 0 ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-orange-500 to-red-600'}`}>
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-white/20 p-4 rounded-2xl">
                                    <Landmark className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-white/80 text-sm font-medium">Patrimoine Net Estimé</p>
                                    <h3 className="text-2xl font-bold">{formatCurrency(data?.patrimoineNet || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-none bg-white">
                            <CardHeader>
                                <CardTitle>Répartition de l'Actif (Inventaire & Créances)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={patrimoineData.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                                            {patrimoineData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white flex flex-col justify-center">
                            <CardHeader>
                                <CardTitle>Détail de la Valorisation du Stock</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Produits Pleins</p>
                                            <p className="text-lg font-bold text-gray-800">{formatCurrency(data?.stockValue || 0)}</p>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${((data?.stockValue || 0) / ((data?.stockValue || 0) + (data?.packagingValue || 0) || 1)) * 100}%` }}></div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <div>
                                            <p className="text-sm text-gray-500 font-medium">Emballages Vides</p>
                                            <p className="text-lg font-bold text-gray-800">{formatCurrency(data?.packagingValue || 0)}</p>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${((data?.packagingValue || 0) / ((data?.stockValue || 0) + (data?.packagingValue || 0) || 1)) * 100}%` }}></div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <p className="text-sm text-gray-500 font-medium mb-1">Total Valeur Physique en Entrepôt/Magasin</p>
                                    <p className="text-3xl font-bold text-indigo-700">{formatCurrency((data?.stockValue || 0) + (data?.packagingValue || 0))}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
