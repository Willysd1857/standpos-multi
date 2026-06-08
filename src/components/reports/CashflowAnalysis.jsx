import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { format } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899'];

export default function CashflowAnalysis() {
    const { formatCurrency } = useCurrency();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['bi-cashflow', date],
        queryFn: () => base44.entities.BIReports.getCashflow(date),
    });

    if (error) return <div className="text-red-500">Erreur de chargement: {error.message}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Trésorerie & Flux de Caisse</h2>
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
                                <div className="bg-green-100 p-4 rounded-2xl">
                                    <TrendingUp className="w-8 h-8 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Recettes Totales</p>
                                    <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(data?.totalRecettes || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-red-100 p-4 rounded-2xl">
                                    <TrendingDown className="w-8 h-8 text-red-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Dépenses Totales</p>
                                    <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(data?.totalDepenses || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`shadow-sm border-none text-white ${(data?.solde || 0) >= 0 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-red-500 to-orange-500'}`}>
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-white/20 p-4 rounded-2xl">
                                    <Wallet className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-white/80 text-sm font-medium">Situation de Caisse</p>
                                    <h3 className="text-2xl font-bold">{formatCurrency(data?.solde || 0)}</h3>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-none">
                            <CardHeader>
                                <CardTitle>Répartition des Recettes</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                {(data?.incomePie || []).length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.incomePie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {data.incomePie.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400">Aucune donnée de recette</div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none">
                            <CardHeader>
                                <CardTitle>Répartition des Dépenses</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                {(data?.expensePie || []).length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.expensePie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {data.expensePie.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400">Aucune donnée de dépense</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm border-none overflow-hidden">
                        <CardHeader className="border-b bg-gray-50/50">
                            <CardTitle className="flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-gray-500" />
                                Journal de Caisse (Chronologique)
                            </CardTitle>
                        </CardHeader>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4">Heure</th>
                                        <th className="px-6 py-4">Type</th>
                                        <th className="px-6 py-4">Description</th>
                                        <th className="px-6 py-4 text-right">Montant</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.journal || []).map((item, i) => (
                                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="px-6 py-3">{format(new Date(item.time), 'HH:mm')}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.type === 'Entrée' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-gray-700">{item.description}</td>
                                            <td className={`px-6 py-3 text-right font-semibold ${item.type === 'Entrée' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.type === 'Entrée' ? '+' : '-'}{formatCurrency(item.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                    {(data?.journal || []).length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="px-6 py-8 text-center text-gray-500">Aucun mouvement aujourd'hui</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
