import React, { useState } from 'react';
import { useAppDate } from '@/hooks/useAppDate';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Trash2, Eye } from 'lucide-react';

export default function UsageHistory({ usages, isLoading, onDelete, onView }) {
    const { formatDate } = useAppDate();
    const [search, setSearch] = useState('');

    const filtered = usages.filter(u =>
        u.reference?.toLowerCase().includes(search.toLowerCase()) ||
        u.notes?.toLowerCase().includes(search.toLowerCase()) ||
        u.ingredients?.some(i => i.name.toLowerCase().includes(search.toLowerCase()))
    );

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
                    <p className="text-gray-500 mt-4">Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">Historique des utilisations</h2>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher..."
                        className="pl-10 rounded-xl"
                    />
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <p className="text-lg font-medium">Aucune utilisation enregistrée</p>
                        <p className="text-sm">Cliquez sur "Nouvelle Utilisation" pour commencer</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gradient-to-r from-orange-50 to-red-50 border-b-2 border-orange-100 hover:bg-gradient-to-r hover:from-orange-50 hover:to-red-50">
                                    <TableHead className="font-bold text-gray-700">Date</TableHead>
                                    <TableHead className="font-bold text-gray-700">Référence</TableHead>
                                    <TableHead className="font-bold text-gray-700">Ingrédients</TableHead>
                                    <TableHead className="font-bold text-gray-700">Notes</TableHead>
                                    <TableHead className="text-right font-bold text-gray-700 w-[120px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((usage) => (
                                    <TableRow key={usage.id} className="hover:bg-orange-50/30 transition-colors border-b border-gray-50">
                                        <TableCell className="font-medium text-gray-600">
                                            {formatDate(usage.created_at, 'dd MMM yyyy HH:mm')}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 font-semibold text-sm">
                                                {usage.reference}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                {usage.ingredients?.map((ing, idx) => (
                                                    <div key={idx} className="text-sm">
                                                        <span className="font-semibold text-gray-900">{ing.name}</span>
                                                        <span className="text-gray-600"> - {Number(ing.quantity).toFixed(2)} {ing.unit} </span>
                                                        <span className="text-xs text-gray-500">
                                                            (Stock: {Number(ing.stock_before).toFixed(2)} {ing.unit} → {Number(ing.stock_after).toFixed(2)} {ing.unit})
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-gray-600 max-w-xs">
                                            {usage.notes || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onView?.(usage)}
                                                    className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    title="Voir détails"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete?.(usage.id)}
                                                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {filtered.length > 0 && (
                <p className="text-sm text-gray-500 text-center">
                    {filtered.length} utilisation{filtered.length > 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
