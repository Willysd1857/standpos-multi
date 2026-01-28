import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppDate } from '@/hooks/useAppDate';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, CheckCircle, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';

const paymentLabels = {
    cash: 'Espèces',
    mvola: 'MVola',
    orange_money: 'Orange Money',
    airtel_money: 'Airtel Money',
    visa: 'Visa/Carte'
};

export default function GroupedPurchaseReceipt({ open, onClose, purchaseGroup }) {
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => base44.entities.Settings.get()
    });

    const { formatDate } = useAppDate();
    const businessInfo = settings || {};

    const handlePrint = () => {
        const printWindow = window.open('', '', 'width=400,height=600');
        const receiptContent = document.getElementById('grouped-receipt-content');

        printWindow.document.write(`
      <html>
        <head>
          <title>Bon d'approvisionnement ${purchaseGroup?.reference}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; padding: 20px; font-size: 12px; line-height: 1.4; }
            .receipt { max-width: 300px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 15px; }
            .business-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
            .info-line { font-size: 11px; margin: 2px 0; }
            .section { margin: 15px 0; }
            .section-title { font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-size: 11px; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; }
            .product-item { margin: 10px 0; padding: 8px; background: #f9f9f9; border-radius: 4px; }
            .divider { border-top: 1px dashed #666; margin: 10px 0; }
            .total { font-size: 14px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 2px solid #000; }
            .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 2px dashed #000; font-size: 11px; }
            @media print { body { padding: 0; } button { display: none; } }
          </style>
        </head>
        <body>${receiptContent.innerHTML}</body>
      </html>
    `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    if (!purchaseGroup) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-white">
                <div className="space-y-4">
                    {/* Success animation */}
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center py-4">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-3 shadow-lg"
                        >
                            <CheckCircle className="w-10 h-10 text-white" />
                        </motion.div>
                        <h3 className="text-xl font-bold text-gray-800">Approvisionnement groupé enregistré !</h3>
                        <p className="text-sm text-gray-500">{purchaseGroup.items?.length || 0} produits approvisionnés</p>
                    </motion.div>

                    {/* Receipt preview */}
                    <div className="bg-gray-50 rounded-2xl p-6 border-2 border-gray-200 max-h-[400px] overflow-y-auto">
                        <div id="grouped-receipt-content" className="receipt">
                            {/* Header */}
                            <div className="header">
                                <div className="business-name">{businessInfo.business_name || 'Moonlight Snack-Bar'}</div>
                                <div className="info-line">Antsirabe • Tél: 0345678901</div>
                                <div className="info-line">NIF: 123456789 • STAT: 111023456789</div>
                            </div>

                            {/* Title */}
                            <div className="section" style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
                                    BON D'APPROVISIONNEMENT GROUPÉ
                                </div>
                                <div className="info-line">N° {purchaseGroup.reference}</div>
                            </div>

                            <div className="divider"></div>

                            {/* Info */}
                            <div className="section">
                                <div className="item">
                                    <span>Date:</span>
                                    <span>{formatDate(purchaseGroup.date || purchaseGroup.created_at)}</span>
                                </div>
                                {purchaseGroup.supplier_name && (
                                    <div className="item">
                                        <span>Fournisseur:</span>
                                        <span>{purchaseGroup.supplier_name}</span>
                                    </div>
                                )}
                                <div className="item">
                                    <span>Paiement:</span>
                                    <span>{paymentLabels[purchaseGroup.payment_method] || purchaseGroup.payment_method}</span>
                                </div>
                            </div>

                            <div className="divider"></div>

                            {/* Products */}
                            <div className="section">
                                <div className="section-title">Produits ({purchaseGroup.items?.length || 0})</div>
                                {purchaseGroup.items?.map((item, index) => (
                                    <div key={index} className="product-item">
                                        <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                                            <Package style={{ width: '10px', height: '10px', display: 'inline', marginRight: '5px' }} />
                                            {item.product_name}
                                        </div>
                                        <div className="item" style={{ fontSize: '11px' }}>
                                            <span>{item.quantity} x {Number(item.unit_price).toLocaleString()} Ar</span>
                                            <span style={{ fontWeight: 'bold' }}>{Number(item.total).toLocaleString()} Ar</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="divider"></div>

                            {/* Total */}
                            <div className="total">
                                <div className="item" style={{ fontSize: '16px' }}>
                                    <span>MONTANT TOTAL</span>
                                    <span>{Number(purchaseGroup.total_amount).toLocaleString()} Ar</span>
                                </div>
                            </div>

                            {/* Notes */}
                            {purchaseGroup.notes && (
                                <div className="section">
                                    <div className="section-title">Notes</div>
                                    <div style={{ fontSize: '11px', fontStyle: 'italic' }}>{purchaseGroup.notes}</div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="footer">
                                <div>───────────────────</div>
                                <div style={{ marginTop: '5px' }}>Merci pour votre approvisionnement</div>
                                <div style={{ fontSize: '10px', marginTop: '5px', color: '#666' }}>Powered by Moonlight POS</div>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
                            <X className="w-4 h-4 mr-2" />
                            Fermer
                        </Button>
                        <Button
                            onClick={handlePrint}
                            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-green-500/30"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            Imprimer
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
