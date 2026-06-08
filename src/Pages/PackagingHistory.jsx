import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, History, AlertTriangle, Users, Filter, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PackagingHistory() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('history');
    
    // Fetch History
    const { data: history = [], isLoading: loadingHistory } = useQuery({
        queryKey: ['packaging_history'],
        queryFn: () => base44.entities.Packaging.getHistory(),
    });

    // Fetch Consignments
    const { data: consignments = [], isLoading: loadingConsignments } = useQuery({
        queryKey: ['packaging_consignments'],
        queryFn: () => base44.entities.Packaging.getConsignments(),
    });

    const formatMovementType = (type) => {
        switch (type) {
            case 'in': return <Badge className="bg-green-100 text-green-700">Entrée</Badge>;
            case 'out': return <Badge className="bg-blue-100 text-blue-700">Sortie</Badge>;
            case 'return': return <Badge className="bg-purple-100 text-purple-700">Retour Frs</Badge>;
            case 'consignment_return': return <Badge className="bg-indigo-100 text-indigo-700">Retour Client</Badge>;
            case 'breakage': return <Badge className="bg-red-100 text-red-700">Casse</Badge>;
            default: return <Badge>{type}</Badge>;
        }
    };

    const filterData = (data, search) => {
        if (!search) return data;
        const lowerSearch = search.toLowerCase();
        return data.filter(item => 
            (item.product_name && item.product_name.toLowerCase().includes(lowerSearch)) ||
            (item.entity_name && item.entity_name.toLowerCase().includes(lowerSearch)) ||
            (item.notes && item.notes.toLowerCase().includes(lowerSearch))
        );
    };

    const breakages = history.filter(h => h.movement_type === 'breakage');
    const clientConsignments = consignments.filter(c => c.entity_type === 'customer');

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-7 h-7 text-indigo-600" />
                        Historique des Flux d'Emballages
                    </h1>
                    <p className="text-gray-500">Suivi détaillé des bouteilles et cageots vides</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-white/80 p-1 rounded-xl shadow-sm">
                        <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                            <History className="w-4 h-4 mr-2" />
                            Tous les mouvements
                        </TabsTrigger>

                        <TabsTrigger value="consignments" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                            <Users className="w-4 h-4 mr-2" />
                            Consignes Clients
                        </TabsTrigger>
                    </TabsList>

                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Rechercher (produit, notes, client)..."
                            className="pl-10 rounded-xl bg-white"
                        />
                    </div>

                    {/* Mouvements */}
                    <TabsContent value="history">
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Produit</TableHead>
                                        <TableHead className="text-right">Bouteilles</TableHead>
                                        <TableHead className="text-right">Cageots</TableHead>
                                        <TableHead>Lieu / Responsable</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filterData(history, searchQuery).map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {format(new Date(item.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                                            </TableCell>
                                            <TableCell>{formatMovementType(item.movement_type)}</TableCell>
                                            <TableCell className="font-medium">{item.product_name}</TableCell>
                                            <TableCell className="text-right font-mono font-medium text-purple-700">
                                                {item.empty_packaging_qty > 0 ? `${item.empty_packaging_qty} U` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium text-indigo-700">
                                                {item.empty_secondary_packaging_qty > 0 ? `${item.empty_secondary_packaging_qty} C` : '-'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">{item.location?.name || 'Magasin'}</div>
                                                <div className="text-xs text-gray-500">{item.user?.full_name}</div>
                                            </TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-xs truncate" title={item.notes}>
                                                {item.notes}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filterData(history, searchQuery).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                                Aucun mouvement trouvé
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>


                    {/* Consignes Clients */}
                    <TabsContent value="consignments">
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Date Consigne</TableHead>
                                        <TableHead>Produit</TableHead>
                                        <TableHead className="text-right">Bouteilles à rendre</TableHead>
                                        <TableHead className="text-right">Cageots à rendre</TableHead>
                                        <TableHead>Statut</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filterData(clientConsignments, searchQuery).map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-bold">{item.entity_name}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {format(new Date(item.created_at), 'dd MMM yyyy', { locale: fr })}
                                            </TableCell>
                                            <TableCell className="font-medium">{item.product_name}</TableCell>
                                            <TableCell className="text-right font-mono font-medium text-purple-700">
                                                {item.empty_packaging_qty > 0 ? `${item.empty_packaging_qty} U` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium text-indigo-700">
                                                {item.empty_secondary_packaging_qty > 0 ? `${item.empty_secondary_packaging_qty} C` : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {item.status === 'pending' ? (
                                                    <Badge className="bg-orange-100 text-orange-700">En attente</Badge>
                                                ) : item.status === 'partial' ? (
                                                    <Badge className="bg-yellow-100 text-yellow-700">Partiel</Badge>
                                                ) : (
                                                    <Badge className="bg-green-100 text-green-700">Retourné</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filterData(clientConsignments, searchQuery).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                                Aucune consigne client en cours
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
