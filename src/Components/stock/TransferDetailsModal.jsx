import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Package, Truck, ArrowRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function TransferDetailsModal({ open, onClose, transfer }) {
    if (!transfer) return null;

    const STATUS_MAP = {
        in_transit: { label: 'En Transit', color: 'bg-amber-100 text-amber-700' },
        received: { label: 'Réceptionné', color: 'bg-green-100 text-green-700' },
        completed: { label: 'Réceptionné', color: 'bg-green-100 text-green-700' },
        cancelled: { label: 'Annulé', color: 'bg-red-100 text-red-700' },
    };
    
    const status = STATUS_MAP[transfer.status] || STATUS_MAP.in_transit;

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="w-5 h-5 text-violet-600" />
                        Détails du Transfert: {transfer.reference}
                    </DialogTitle>
                    <DialogDescription>
                        Créé le {new Date(transfer.created_at).toLocaleString('fr-FR')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Origine</p>
                            <p className="font-bold text-gray-900">{transfer.from_loc?.name || 'Inconnu'}</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Destination</p>
                            <p className="font-bold text-gray-900">{transfer.to_loc?.name || 'Inconnu'}</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1 space-y-1">
                            <p className="text-xs text-gray-500">Statut</p>
                            <Badge className={`${status.color} border-0`}>{status.label}</Badge>
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-xs text-gray-500">Expédié le</p>
                            <p className="text-sm font-medium">{transfer.shipped_at ? new Date(transfer.shipped_at).toLocaleString('fr-FR') : '-'}</p>
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-xs text-gray-500">Réceptionné le</p>
                            <p className="text-sm font-medium">{transfer.received_at ? new Date(transfer.received_at).toLocaleString('fr-FR') : '-'}</p>
                        </div>
                    </div>

                    {transfer.notes && (
                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-600 font-bold mb-1">Notes / Justifications</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{transfer.notes}</p>
                        </div>
                    )}

                    <div>
                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4" /> Articles transférés
                        </h4>
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50">
                                        <TableHead>Produit</TableHead>
                                        <TableHead className="text-center">Qté Produit</TableHead>
                                        <TableHead className="text-center">Bout. Vides</TableHead>
                                        <TableHead className="text-center">Casiers</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transfer.stock_transfer_items?.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.product_name || item.products?.name || 'Produit Inconnu'}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-center">{item.empty_packaging_qty}</TableCell>
                                            <TableCell className="text-center">{item.empty_secondary_packaging_qty}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
