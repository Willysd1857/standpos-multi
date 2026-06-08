import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';

export default function PeriodicAnalysis() {
    const { formatCurrency } = useCurrency();
    const [period, setPeriod] = useState('weekly');

    const { data, isLoading, error } = useQuery({
        queryKey: ['bi-periodic', period],
        queryFn: () => base44.entities.BIReports.getPeriodic(period),
    });

    if (error) return <div className="text-red-500">Erreur de chargement: {error.message}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Analyse Périodique</h2>
                <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Sélectionner la période" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="weekly">7 Derniers Jours</SelectItem>
                        <SelectItem value="monthly">Mois en cours</SelectItem>
                        <SelectItem value="quarterly">3 Derniers Mois</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isLoading ? (
                <Skeleton className="w-full h-[400px] rounded-2xl" />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="col-span-1 lg:col-span-2 shadow-sm border-none">
                        <CardHeader>
                            <CardTitle>Évolution Ventes vs Dépenses</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data?.chartData || []} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" />
                                    <YAxis tickFormatter={(val) => formatCurrency(val).replace(/[^0-9KkMmbB.,-]/g, '')} />
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Legend />
                                    <Line type="monotone" dataKey="sales" name="Ventes" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="expenses" name="Dépenses" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white border-none shadow-md">
                            <CardContent className="pt-6">
                                <p className="text-blue-100 text-sm font-medium">Total Ventes ({period === 'weekly' ? '7j' : period === 'monthly' ? 'Mois' : 'Trimestre'})</p>
                                <h3 className="text-3xl font-bold mt-2">{formatCurrency(data?.summary?.totalSales || 0)}</h3>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-gradient-to-br from-red-500 to-red-700 text-white border-none shadow-md">
                            <CardContent className="pt-6">
                                <p className="text-red-100 text-sm font-medium">Total Dépenses ({period === 'weekly' ? '7j' : period === 'monthly' ? 'Mois' : 'Trimestre'})</p>
                                <h3 className="text-3xl font-bold mt-2">{formatCurrency(data?.summary?.totalExpenses || 0)}</h3>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
