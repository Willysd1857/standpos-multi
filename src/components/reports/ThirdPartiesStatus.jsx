import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Truck, Package } from 'lucide-react';

export default function ThirdPartiesStatus() {
    const { formatCurrency } = useCurrency();

    const { data, isLoading, error } = useQuery({
        queryKey: ['bi-third-parties'],
        queryFn: () => base44.entities.BIReports.getThirdParties(),
    });

    if (error) return <div className="text-red-500">Erreur de chargement: {error.message}</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">État des Tiers (Clients & Fournisseurs)</h2>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-[400px] col-span-1 lg:col-span-2 rounded-2xl" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-orange-100 p-4 rounded-2xl">
                                    <Users className="w-8 h-8 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Créances Clients</p>
                                    <h3 className="text-2xl font-bold text-gray-800">
                                        {formatCurrency(data?.clientDebts?.reduce((acc, curr) => acc + curr.debt, 0) || 0)}
                                    </h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-rose-100 p-4 rounded-2xl">
                                    <Truck className="w-8 h-8 text-rose-600" />
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm font-medium">Dettes Fournisseurs</p>
                                    <h3 className="text-2xl font-bold text-gray-800">
                                        {formatCurrency(data?.supplierDebts?.reduce((acc, curr) => acc + curr.debt, 0) || 0)}
                                    </h3>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-gradient-to-r from-teal-500 to-emerald-600 text-white">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="bg-white/20 p-4 rounded-2xl">
                                    <Package className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-white/80 text-sm font-medium">Emballages Consignés</p>
                                    <h3 className="text-2xl font-bold">
                                        {data?.clientConsignments || 0} chez Clients
                                    </h3>
                                    <p className="text-xs text-white/70">{data?.supplierConsignments || 0} à rendre</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-none bg-white">
                            <CardHeader>
                                <CardTitle>Top Créances Clients (Impayés)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                {(data?.clientDebts || []).length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.clientDebts.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" tickFormatter={(val) => formatCurrency(val).replace(/[^0-9KkMmbB.,-]/g, '')} />
                                            <YAxis dataKey="name" type="category" width={100} />
                                            <RechartsTooltip formatter={(value) => formatCurrency(value)} cursor={{fill: 'transparent'}} />
                                            <Bar dataKey="debt" name="Reste à Payer" fill="#f97316" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400">Aucune créance client</div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-none bg-white">
                            <CardHeader>
                                <CardTitle>Dettes Fournisseurs</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                {(data?.supplierDebts || []).length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.supplierDebts.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" tickFormatter={(val) => formatCurrency(val).replace(/[^0-9KkMmbB.,-]/g, '')} />
                                            <YAxis dataKey="name" type="category" width={100} />
                                            <RechartsTooltip formatter={(value) => formatCurrency(value)} cursor={{fill: 'transparent'}} />
                                            <Bar dataKey="debt" name="Dette" fill="#e11d48" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400">Aucune dette fournisseur</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
