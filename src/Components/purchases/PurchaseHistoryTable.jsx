import React, { useState } from 'react';
import { useAppDate } from '@/hooks/useAppDate';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, CheckCircle, Clock, XCircle, Eye, Search } from 'lucide-react';
import PurchaseDetailModal from './PurchaseDetailModal';

const statusConfig = {
    validated: { label: 'Validé', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    pending: { label: 'En attente', icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
    cancelled: { label: 'Annulé', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' }
};

export default function PurchaseHistoryTable({ purchases, onDelete, isLoading }) {
    const { formatDate } = useAppDate();
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Apply search filter
    const filteredPurchases = purchases.filter(purchase => {
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        return (
            purchase.product_name?.toLowerCase().includes(query) ||
            purchase.supplier_name?.toLowerCase().includes(query) ||
            purchase.reference?.toLowerCase().includes(query) ||
            purchase.payment_method?.toLowerCase().includes(query) ||
            formatDate(purchase.date || purchase.created_at).toLowerCase().includes(query)
        );
    });

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                    <p className="text-gray-500 mt-4">Chargement...</p>
                </div>
            </div>
        );
    }

    if (purchases.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className="p-12 text-center text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg font-medium">Aucun approvisionnement enregistré</p>
                    <p className="text-sm">Cliquez sur un produit pour créer un approvisionnement</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search bar */}
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher dans l'historique..."
                        className="pl-10 rounded-xl bg-white border-gray-200"
                    />
                </div>
                <span className="text-sm text-gray-500">
                    {filteredPurchases.length} résultat{filteredPurchases.length > 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50">
                                <TableHead className="py-4 font-semibold">Date</TableHead>
                                <TableHead className="font-semibold">Référence</TableHead>
                                <TableHead className="font-semibold">Produit</TableHead>
                                <TableHead className="font-semibold">Quantité</TableHead>
                                <TableHead className="font-semibold">Prix Unitaire</TableHead>
                                <TableHead className="font-semibold">Montant Total</TableHead>
                                <TableHead className="font-semibold">Fournisseur</TableHead>
                                <TableHead className="font-semibold">Paiement</TableHead>
                                <TableHead className="font-semibold">Statut</TableHead>
                                <TableHead className="text-right w-[150px] font-semibold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPurchases.map((purchase) => {
                                const status = statusConfig[purchase.status] || statusConfig.validated;
                                const StatusIcon = status.icon;
                                const isGroup = purchase.type === 'group';

                                return (
                                    <TableRow
                                        key={purchase.id}
                                        className="hover:bg-gray-50/50 transition-colors"
                                    >
                                        <TableCell className="text-gray-600 font-medium">
                                            {formatDate(purchase.date || purchase.created_at, 'dd MMM yyyy')}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-gray-700">
                                            {purchase.reference || '-'}
                                        </TableCell>
                                        <TableCell className="font-semibold text-gray-900">
                                            {isGroup && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2">GROUPÉ</span>}
                                            {purchase.product_name}
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold text-sm">
                                                {purchase.quantity}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {purchase.unit_price === '-' ? '-' : `${Number(purchase.unit_price).toLocaleString()} Ar`}
                                        </TableCell>
                                        <TableCell className="font-bold text-green-600">
                                            {Number(purchase.total_amount).toLocaleString()} Ar
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {purchase.supplier_name || '-'}
                                        </TableCell>
                                        <TableCell className="text-gray-600 capitalize">
                                            {purchase.payment_method?.replace('_', ' ') || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}>
                                                <StatusIcon className="w-3.5 h-3.5" />
                                                {status.label}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setSelectedPurchase(purchase)}
                                                    className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    title="Voir détails"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete(purchase.id, purchase.type || 'individual')}
                                                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Detail Modal */}
            <PurchaseDetailModal
                open={!!selectedPurchase}
                onClose={() => setSelectedPurchase(null)}
                purchase={selectedPurchase}
            />
        </div>
    );
}
