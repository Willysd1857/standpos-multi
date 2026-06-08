import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { PiggyBank, Percent, Coins } from 'lucide-react';

export default function ProfitabilityAnalysis() {
    const { formatCurrency } = useCurrency();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['bi-margins', date],
        queryFn: () => base44.entities.BIReports.getMargins(date),
    });

    if (error) return <div className="text-red-500">Erreur de chargement: {error.message}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Rentabilité & Marges</h2>
                <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-48 bg-white border-none shadow-sm"
                />
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-[400px] col-span-3 rounded-2xl" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-blue-100 p-4 rounded-2xl">
                                    <Coins className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Chiffre d'Affaires</p>
                                    <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(data?.totalRevenue || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-indigo-100 p-4 rounded-2xl">
                                    <PiggyBank className="w-8 h-8 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Marge Brute</p>
                                    <h3 className="text-2xl font-bold text-indigo-700">{formatCurrency(data?.grossMargin || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-white/20 p-4 rounded-2xl">
                                    <Percent className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-white/80 text-sm font-medium">Taux de Marge</p>
                                    <h3 className="text-2xl font-bold">{data?.marginPercent || 0}%</h3>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm border-none bg-white">
                        <CardHeader>
                            <CardTitle>Top 10 Marges par Produit</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            {(data?.productMarginList || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.productMarginList} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis tickFormatter={(val) => formatCurrency(val).replace(/[^0-9KkMmbB.,-]/g, '')} />
                                        <RechartsTooltip formatter={(value) => formatCurrency(value)} cursor={{fill: 'transparent'}} />
                                        <Legend />
                                        <Bar dataKey="revenue" name="Chiffre d'Affaires" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="margin" name="Marge Brute" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400">Aucune donnée de marge</div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
