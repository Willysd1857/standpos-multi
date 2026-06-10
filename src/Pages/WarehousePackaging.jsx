import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, fetchAPI } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, AlertTriangle, Truck, Clock, RefreshCw, RotateCcw, Loader2, CheckCircle2, Wine, Boxes } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function WarehousePackaging() {
    const { formatCurrency } = useCurrency();
    const { user, isAdmin } = useAuth();
    const queryClient = useQueryClient();

    // Return modal state
    const [returnItem, setReturnItem] = useState(null);
    const [returnBottles, setReturnBottles] = useState('');
    const [returnCrates, setReturnCrates] = useState('');
    const [returnLocationId, setReturnLocationId] = useState('');

    const needsLocationPicker = isAdmin() && !user?.location_id;

    const { data: allLocations = [] } = useQuery({
        queryKey: ['locations'],
        queryFn: () => fetchAPI('/locations'),
        enabled: needsLocationPicker,
    });

    // Fetch outstanding packaging from movements (reliable source)
    const { data: outstanding = [], isLoading: loadingOutstanding } = useQuery({
        queryKey: ['supplier-outstanding'],
        queryFn: () => base44.entities.Packaging.getSupplierOutstanding(),
        refetchInterval: 5000,
    });

    // Also fetch consignments as fallback (for cases where verify-reception was used)
    const { data: consignments = [], isLoading: loadingConsignments } = useQuery({
        queryKey: ['packaging_consignments'],
        queryFn: () => base44.entities.Packaging.getConsignments({ entity_type: 'supplier' }),
        refetchInterval: 5000,
    });

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['supplier-outstanding'] });
        queryClient.invalidateQueries({ queryKey: ['packaging_consignments'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        queryClient.invalidateQueries({ queryKey: ['location-packaging-stock'] });
        queryClient.invalidateQueries({ queryKey: ['packaging_history'] });
    };

    // Merge both sources: outstanding movements + consignments, deduplicate by supplier+product
    const allItems = useMemo(() => {
        const map = new Map();

        // First: add outstanding from movements (primary source)
        for (const item of outstanding) {
            const key = `${item.supplier_id}::${item.product_id}`;
            map.set(key, {
                id: item.id,
                supplier_id: item.supplier_id,
                entity_name: item.entity_name,
                product_id: item.product_id,
                product_name: item.product_name,
                empty_packaging_qty: item.empty_packaging_qty,
                empty_secondary_packaging_qty: item.empty_secondary_packaging_qty,
                created_at: item.created_at,
                source_reference: item.source_reference,
                due_date: null,
                status: 'pending',
                packaging_deposit_value: 0,
                secondary_packaging_deposit_value: 0
            });
        }

        // Then: add consignments (not yet returned) — only if not already covered
        for (const c of consignments) {
            if (c.status === 'returned') continue;
            const key = `${c.entity_id}::${c.product_id}`;
            if (!map.has(key)) {
                map.set(key, {
                    id: c.id,
                    supplier_id: c.entity_id,
                    entity_name: c.entity_name,
                    product_id: c.product_id,
                    product_name: c.product_name,
                    empty_packaging_qty: Number(c.empty_packaging_qty) || 0,
                    empty_secondary_packaging_qty: Number(c.empty_secondary_packaging_qty) || 0,
                    created_at: c.created_at,
                    source_reference: c.source_transaction_id,
                    due_date: c.due_date,
                    status: c.status,
                    packaging_deposit_value: Number(c.packaging_deposit_value) || 0,
                    secondary_packaging_deposit_value: Number(c.secondary_packaging_deposit_value) || 0
                });
            } else {
                // Consignment has more info (deposit values, due_date) — merge if needed
                const existing = map.get(key);
                if (!existing.due_date && c.due_date) existing.due_date = c.due_date;
                if (!existing.packaging_deposit_value && c.packaging_deposit_value) {
                    existing.packaging_deposit_value = Number(c.packaging_deposit_value) || 0;
                }
                if (!existing.secondary_packaging_deposit_value && c.secondary_packaging_deposit_value) {
                    existing.secondary_packaging_deposit_value = Number(c.secondary_packaging_deposit_value) || 0;
                }
            }
        }

        return [...map.values()];
    }, [outstanding, consignments]);

    const pendingItems = allItems.filter(c => c.status !== 'returned');
    const isLoading = loadingOutstanding || loadingConsignments;

    // Calculate Financial Risk
    const financialRisk = useMemo(() => {
        let total = 0;
        pendingItems.forEach(c => {
            total += (c.empty_packaging_qty * (c.packaging_deposit_value || 0)) +
                     (c.empty_secondary_packaging_qty * (c.secondary_packaging_deposit_value || 0));
        });
        return total;
    }, [pendingItems]);

    // Check for late consignments
    const lateConsignments = pendingItems.filter(c => {
        if (!c.due_date) return false;
        return new Date(c.due_date) < new Date();
    });

    const isLate = lateConsignments.length > 0;

    // ─── Return mutation ───────────────────────────────────────────────────
    const returnMutation = useMutation({
        mutationFn: (data) => base44.entities.Supplier.returnPackaging(data.supplier_id, {
            product_id: data.product_id,
            empty_qty: data.empty_qty,
            empty_secondary_qty: data.empty_secondary_qty,
        }),
        onSuccess: (result) => {
            const refund = result?.refundValue || 0;
            toast.success(
                `Emballages retournés au fournisseur. Dettes réduites de ${formatCurrency(refund)}`
            );
            handleRefresh();
            setReturnItem(null);
            setReturnBottles('');
            setReturnCrates('');
            setReturnLocationId('');
        },
        onError: (err) => {
            toast.error(err.message || 'Erreur lors du retour au fournisseur');
        },
    });

    const openReturnModal = (item) => {
        setReturnItem(item);
        setReturnBottles(String(item.empty_packaging_qty || ''));
        setReturnCrates(String(item.empty_secondary_packaging_qty || ''));
        setReturnLocationId(user?.location_id || '');
    };

    const submitReturn = () => {
        if (!returnItem) return;
        if (!returnItem.supplier_id) {
            toast.error('Fournisseur introuvable');
            return;
        }
        const bQty = Number(returnBottles) || 0;
        const cQty = Number(returnCrates) || 0;
        if (bQty <= 0 && cQty <= 0) {
            toast.error('Veuillez saisir une quantité');
            return;
        }
        if (bQty > (returnItem.empty_packaging_qty || 0)) {
            toast.error(`Maximum ${returnItem.empty_packaging_qty} bouteille(s) disponible(s)`);
            return;
        }
        if (cQty > (returnItem.empty_secondary_packaging_qty || 0)) {
            toast.error(`Maximum ${returnItem.empty_secondary_packaging_qty} cageot(s) disponible(s)`);
            return;
        }
        if (needsLocationPicker && !returnLocationId) {
            toast.error('Veuillez sélectionner un emplacement');
            return;
        }

        returnMutation.mutate({
            supplier_id: returnItem.supplier_id,
            product_id: returnItem.product_id,
            empty_qty: bQty,
            empty_secondary_qty: cQty,
        });
    };

    const returnItemRisk = returnItem
        ? ((Number(returnBottles) || 0) * (returnItem.packaging_deposit_value || 0)) +
          ((Number(returnCrates) || 0) * (returnItem.secondary_packaging_deposit_value || 0))
        : 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Package className="w-7 h-7 text-indigo-600" />
                            Gestion des Emballages (Entrepôt)
                        </h1>
                        <p className="text-gray-500">Suivi des consignes fournisseurs et gestion des retours</p>
                    </div>
                    <Button variant="outline" onClick={handleRefresh} disabled={isLoading} className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Actualiser
                    </Button>
                </div>

                {/* Dashboard / Alertes */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Emballages à retourner</p>
                                <p className="text-2xl font-bold text-gray-800">{pendingItems.length}</p>
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

                {/* Table des Emballages à retourner aux Fournisseurs */}
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
                                <TableHead className="text-right">À rendre (B)</TableHead>
                                <TableHead className="text-right">À rendre (C)</TableHead>
                                <TableHead className="text-right">Valeur Risque</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-center">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                                        Chargement...
                                    </TableCell>
                                </TableRow>
                            )}
                            {!isLoading && pendingItems.map(item => {
                                const isItemLate = item.due_date && new Date(item.due_date) < new Date();
                                const daysLeft = item.due_date ? differenceInDays(new Date(item.due_date), new Date()) : null;
                                const itemRisk = (item.empty_packaging_qty * (item.packaging_deposit_value || 0)) +
                                                 (item.empty_secondary_packaging_qty * (item.secondary_packaging_deposit_value || 0));

                                return (
                                    <TableRow key={item.id} className={isItemLate ? 'bg-red-50/50 hover:bg-red-50' : ''}>
                                        <TableCell className="font-bold">{item.entity_name}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {item.created_at ? format(new Date(item.created_at), 'dd MMM yyyy', { locale: fr }) : '-'}
                                        </TableCell>
                                        <TableCell className={`whitespace-nowrap font-medium ${isItemLate ? 'text-red-600' : ''}`}>
                                            {item.due_date ? format(new Date(item.due_date), 'dd MMM yyyy', { locale: fr }) : 'Non défini'}
                                            {daysLeft !== null && daysLeft > 0 && <span className="text-xs text-gray-500 ml-2">({daysLeft}j)</span>}
                                        </TableCell>
                                        <TableCell className="font-medium">{item.product_name}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-purple-700">
                                            {item.empty_packaging_qty > 0 ? `${item.empty_packaging_qty} U` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-indigo-700">
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
                                        <TableCell className="text-center">
                                            <Button
                                                size="sm"
                                                onClick={() => openReturnModal(item)}
                                                className="rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white gap-1.5 text-xs shadow-sm"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                Retourner
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {!isLoading && pendingItems.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                                        Aucun emballage à retourner aux fournisseurs.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>

                {/* ─── Return Modal ──────────────────────────────────────────── */}
                <AnimatePresence>
                    {returnItem && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
                            >
                                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-teal-50/60 to-cyan-50/60">
                                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                        <RotateCcw className="w-5 h-5 text-teal-600" />
                                        Retour d'emballages au fournisseur
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {returnItem.entity_name} — {returnItem.product_name}
                                    </p>
                                </div>
                                <div className="p-5 space-y-4">
                                    {needsLocationPicker && (
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-gray-700">Emplacement source *</Label>
                                            <select
                                                value={returnLocationId}
                                                onChange={(e) => setReturnLocationId(e.target.value)}
                                                className="flex h-10 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
                                            >
                                                <option value="">— Sélectionner un emplacement —</option>
                                                {allLocations.filter(l => l.is_active !== false).map(loc => (
                                                    <option key={loc.id} value={loc.id}>
                                                        {loc.name} ({loc.type === 'store' ? 'Magasin' : 'Entrepôt'})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                                <Wine className="w-4 h-4 text-purple-600" />
                                                Bouteilles vides
                                            </Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                max={returnItem.empty_packaging_qty || 0}
                                                value={returnBottles}
                                                onChange={(e) => setReturnBottles(e.target.value)}
                                                placeholder="0"
                                                className="rounded-xl text-lg font-bold"
                                            />
                                            <p className="text-[11px] text-gray-500">
                                                Dette max : <span className="font-bold text-purple-700">{returnItem.empty_packaging_qty || 0}</span> unité(s)
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                                <Boxes className="w-4 h-4 text-indigo-600" />
                                                Cageots vides
                                            </Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                max={returnItem.empty_secondary_packaging_qty || 0}
                                                value={returnCrates}
                                                onChange={(e) => setReturnCrates(e.target.value)}
                                                placeholder="0"
                                                className="rounded-xl text-lg font-bold"
                                            />
                                            <p className="text-[11px] text-gray-500">
                                                Dette max : <span className="font-bold text-indigo-700">{returnItem.empty_secondary_packaging_qty || 0}</span> cageot(s)
                                            </p>
                                        </div>
                                    </div>

                                    {returnItemRisk > 0 && (
                                        <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-semibold text-green-800">Dette fournisseur réduite de :</span>
                                                <span className="text-lg font-bold text-green-700">
                                                    {formatCurrency(returnItemRisk)}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-green-600 mt-1">
                                                La valeur de consigne des emballages retournés sera déduite de la dette.
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => { setReturnItem(null); setReturnBottles(''); setReturnCrates(''); }} className="rounded-xl" disabled={returnMutation.isPending}>
                                        Annuler
                                    </Button>
                                    <Button
                                        onClick={submitReturn}
                                        className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white gap-2"
                                        disabled={returnMutation.isPending}
                                    >
                                        {returnMutation.isPending ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Retour en cours...</>
                                        ) : (
                                            <><RotateCcw className="w-4 h-4" /> Confirmer le retour</>
                                        )}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
