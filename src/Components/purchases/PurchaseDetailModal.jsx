import React from 'react';
import { useAppDate } from '@/hooks/useAppDate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Package, Calendar, User, CreditCard, FileText } from 'lucide-react';

const paymentLabels = {
    cash: 'Espèces',
    mvola: 'MVola',
    orange_money: 'Orange Money',
    airtel_money: 'Airtel Money',
    visa: 'Visa/Carte'
};

const statusLabels = {
    validated: 'Validé',
    pending: 'En attente',
    cancelled: 'Annulé'
};

export default function PurchaseDetailModal({ open, onClose, purchase }) {
    const { formatDate } = useAppDate();

    if (!purchase) return null;

    const isGroup = purchase.type === 'group';

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Détails de l'approvisionnement
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Reference */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Référence</p>
                                <p className="text-xl font-bold text-blue-600">
                                    {purchase.reference || purchase.id?.slice(0, 8).toUpperCase()}
                                </p>
                            </div>
                            {isGroup && (
                                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                                    GROUPÉ
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <p className="text-xs text-gray-600">Date</p>
                            </div>
                            <p className="font-semibold text-gray-900">
                                {formatDate(purchase.date || purchase.created_at)}
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                                <User className="w-4 h-4 text-gray-500" />
                                <p className="text-xs text-gray-600">Fournisseur</p>
                            </div>
                            <p className="font-semibold text-gray-900">
                                {purchase.supplier_name || '-'}
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                                <CreditCard className="w-4 h-4 text-gray-500" />
                                <p className="text-xs text-gray-600">Paiement</p>
                            </div>
                            <p className="font-semibold text-gray-900">
                                {paymentLabels[purchase.payment_method] || purchase.payment_method || '-'}
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-gray-500" />
                                <p className="text-xs text-gray-600">Statut</p>
                            </div>
                            <p className="font-semibold text-gray-900">
                                {statusLabels[purchase.status] || purchase.status}
                            </p>
                        </div>
                    </div>

                    {/* Products */}
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-green-600" />
                            Produits {isGroup && `(${purchase.items?.length || 0})`}
                        </h4>

                        <div className="space-y-2">
                            {isGroup ? (
                                // Grouped purchase - show all items
                                purchase.items?.map((item, index) => (
                                    <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="font-semibold text-gray-900">{item.product_name}</p>
                                            <p className="text-sm font-bold text-green-600">
                                                {Number(item.total).toLocaleString()} Ar
                                            </p>
                                        </div>
                                        <div className="flex justify-between text-sm text-gray-600">
                                            <span>Quantité: {item.quantity}</span>
                                            <span>Prix unitaire: {Number(item.unit_price).toLocaleString()} Ar</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                // Individual purchase - show single product
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-semibold text-gray-900">{purchase.product_name}</p>
                                        <p className="text-sm font-bold text-green-600">
                                            {Number(purchase.total_amount).toLocaleString()} Ar
                                        </p>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600">
                                        <span>Quantité: {purchase.quantity}</span>
                                        <span>Prix unitaire: {Number(purchase.unit_price).toLocaleString()} Ar</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-gray-700">Montant Total</span>
                            <span className="text-2xl font-bold text-green-600">
                                {Number(purchase.total_amount).toLocaleString()} Ar
                            </span>
                        </div>
                    </div>

                    {/* Notes */}
                    {purchase.notes && (
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 mb-1">Notes</p>
                            <p className="text-sm text-gray-900">{purchase.notes}</p>
                        </div>
                    )}

                    {/* Close button */}
                    <Button
                        onClick={onClose}
                        variant="outline"
                        className="w-full rounded-xl"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Fermer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
