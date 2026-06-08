import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, Truck, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function WarehousePackaging() {
    const { formatCurrency } = useCurrency();
    
    // Fetch Consignments
    const { data: consignments = [], isLoading: loadingConsignments } = useQuery({
        queryKey: ['packaging_consignments'],
        queryFn: () => base44.entities.Packaging.getConsignments({ entity_type: 'supplier' }),
    });

    const pendingConsignments = consignments.filter(c => c.status !== 'returned');

    // Calculate Financial Risk
    const financialRisk = useMemo(() => {
        let total = 0;
        pendingConsignments.forEach(c => {
            total += (c.empty_packaging_qty * (c.packaging_deposit_value || 0)) +
                     (c.empty_secondary_packaging_qty * (c.secondary_packaging_deposit_value || 0));
        });
        return total;
    }, [pendingConsignments]);

    // Check for late consignments
    const lateConsignments = pendingConsignments.filter(c => {
        if (!c.due_date) return false;
        return new Date(c.due_date) < new Date();
    });

    const isLate = lateConsignments.length > 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-7 h-7 text-indigo-600" />
                        Gestion des Emballages (Entrepôt)
                    </h1>
                    <p className="text-gray-500">Suivi des consignes fournisseurs et gestion des retours</p>
                </div>

                {/* Dashboard / Alertes */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Consignes en cours</p>
                                <p className="text-2xl font-bold text-gray-800">{pendingConsignments.length}</p>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                <Truck className="w-6 h-6 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`border-0 shadow-sm ${isLate ? 'bg-red-50' : 'bg-white'}`}>
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className={`text-sm font-medium ${isLate ? 'text-red-700' : 'text-gray-500'}`}>
                                    Retours en retard
                                </p>
                                <p className={`text-2xl font-bold ${isLate ? 'text-red-800' : 'text-gray-800'}`}>
                                    {lateConsignments.length}
                                </p>
                            </div>
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isLate ? 'bg-red-200' : 'bg-gray-100'}`}>
                                <Clock className={`w-6 h-6 ${isLate ? 'text-red-600' : 'text-gray-400'}`} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-amber-50">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-orange-700 font-medium">Risque Financier (Gérant)</p>
                                <p className="text-2xl font-bold text-orange-900">{formatCurrency(financialRisk)}</p>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-orange-200 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-orange-600" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {isLate && (
                    <div className="p-4 bg-red-100 text-red-800 border-l-4 border-red-600 rounded-md shadow-sm">
                        <h3 className="font-bold flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" /> Attention: Emballages en retard
                        </h3>
                        <p className="text-sm mt-1">
                            Vous avez des emballages non retournés dont le délai a expiré. 
                            Tout emballage non retourné au fournisseur sera facturé et retenu sur les comptes.
                        </p>
                    </div>
                )}

                {/* Table des Consignes Fournisseurs */}
                <Card className="border-0 shadow-sm overflow-hidden">
                    <CardHeader className="bg-white border-b">
                        <CardTitle className="text-lg text-gray-800">Emballages à retourner aux Fournisseurs</CardTitle>
                    </CardHeader>
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow>
                                <TableHead>Fournisseur</TableHead>
                                <TableHead>Date Réception</TableHead>
                                <TableHead>Date Limite</TableHead>
                                <TableHead>Produit</TableHead>
                                <TableHead className="text-right">Bouteilles</TableHead>
                                <TableHead className="text-right">Cageots</TableHead>
                                <TableHead className="text-right">Valeur Risque</TableHead>
                                <TableHead>Statut</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pendingConsignments.map(item => {
                                const isItemLate = item.due_date && new Date(item.due_date) < new Date();
                                const daysLeft = item.due_date ? differenceInDays(new Date(item.due_date), new Date()) : null;
                                const itemRisk = (item.empty_packaging_qty * (item.packaging_deposit_value || 0)) +
                                                 (item.empty_secondary_packaging_qty * (item.secondary_packaging_deposit_value || 0));

                                return (
                                    <TableRow key={item.id} className={isItemLate ? 'bg-red-50/50 hover:bg-red-50' : ''}>
                                        <TableCell className="font-bold">{item.entity_name}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {format(new Date(item.created_at), 'dd MMM yyyy', { locale: fr })}
                                        </TableCell>
                                        <TableCell className={`whitespace-nowrap font-medium ${isItemLate ? 'text-red-600' : ''}`}>
                                            {item.due_date ? format(new Date(item.due_date), 'dd MMM yyyy', { locale: fr }) : 'Non défini'}
                                            {daysLeft !== null && daysLeft > 0 && <span className="text-xs text-gray-500 ml-2">({daysLeft}j)</span>}
                                        </TableCell>
                                        <TableCell className="font-medium">{item.product_name}</TableCell>
                                        <TableCell className="text-right font-mono font-medium text-purple-700">
                                            {item.empty_packaging_qty > 0 ? `${item.empty_packaging_qty} U` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium text-indigo-700">
                                            {item.empty_secondary_packaging_qty > 0 ? `${item.empty_secondary_packaging_qty} C` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-orange-600">
                                            {itemRisk > 0 ? formatCurrency(itemRisk) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {isItemLate ? (
                                                <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
                                            ) : (
                                                <Badge className="bg-orange-100 text-orange-700">À rendre</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {pendingConsignments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                                        Aucun emballage à retourner aux fournisseurs.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </div>
    );
}
