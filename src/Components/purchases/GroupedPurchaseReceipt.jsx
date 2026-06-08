import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppDate } from '@/hooks/useAppDate';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, CheckCircle, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useCurrency } from '@/contexts/CurrencyContext';

const paymentLabels = {
    cash: 'Espèces',
    mvola: 'MVola',
    orange_money: 'Orange Money',
    airtel_money: 'Airtel Money',
    visa: 'Virement / Carte'
};

const paymentTypeLabels = {
    cash: 'COMPTANT',
    partial: 'PARTIEL',
    credit: 'À CRÉDIT'
};

export default function GroupedPurchaseReceipt({ open, onClose, purchaseGroup }) {
    const { formatCurrency } = useCurrency();
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => base44.entities.Settings.get()
    });

    const { formatDate } = useAppDate();
    const businessInfo = settings || {};

    const handlePrint = () => {
        const printWindow = window.open('', '', 'width=400,height=600');
        const receiptContent = document.getElementById('grouped-receipt-content');

        // Fix relative image paths for the new window
        let content = receiptContent.innerHTML;
        const origin = window.location.origin;
        content = content.replace(/src="\/uploads\//g, `src="${origin}/uploads/`);

        printWindow.document.write(`
      <html>
        <head>
          <title>Bon d'approvisionnement ${purchaseGroup?.reference}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
          <style>
            * { 
              margin: 0; 
              padding: 0; 
              box-sizing: border-box; 
              font-family: 'Courier Prime', 'Courier New', monospace !important;
              font-weight: 700 !important;
              text-transform: uppercase !important;
            }
            body { 
              font-family: 'Courier Prime', 'Courier New', monospace !important;
              padding: 10px;
              font-size: 12px;
              line-height: 1.3;
              font-weight: 700;
            }
            .receipt { max-width: 300px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: center; text-align: left; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; gap: 15px; }
            .header-info { flex: 1; }
            .logo { width: 80px; height: 60px; object-fit: contain; object-position: right center; }
            .business-name { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
            .info-line { font-size: 10px; margin: 1px 0; }
            .section { margin: 8px 0; }
            .section-title { font-weight: 700; margin-bottom: 5px; text-transform: uppercase; font-size: 10px; }
            .item { display: flex; justify-content: space-between; margin: 3px 0; }
            .divider { border-top: 1px dashed #666; margin: 5px 0; }
            .total { font-size: 14px; font-weight: 700; margin-top: 5px; padding-top: 5px; border-top: 2px solid #000; }
            .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000; font-size: 10px; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${content}
          </div>
        </body>
      </html>
    `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
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
                            {/* Title */}
                            <div className="section" style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                    BON D'APPROVISIONNEMENT GROUPÉ
                                </div>
                                <div className="info-line" style={{ fontWeight: 'bold' }}>N° {purchaseGroup.reference?.toUpperCase()}</div>
                            </div>

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
                                    <span>Mode:</span>
                                    <span>{paymentTypeLabels[purchaseGroup.payment_type] || 'COMPTANT'}</span>
                                </div>
                                <div className="item">
                                    <span>Paiement:</span>
                                    <span>{paymentLabels[purchaseGroup.payment_method] || purchaseGroup.payment_method}</span>
                                </div>
                                {(Number(purchaseGroup.paid_amount) || 0) > 0 && (
                                    <div className="item">
                                        <span>Versé:</span>
                                        <span>{formatCurrency(purchaseGroup.paid_amount)}</span>
                                    </div>
                                )}
                                {(Number(purchaseGroup.debt_amount) || 0) > 0 && (
                                    <div className="item" style={{ color: '#b91c1c' }}>
                                        <span>Reste à payer:</span>
                                        <span style={{ fontWeight: 'bold' }}>{formatCurrency(purchaseGroup.debt_amount)}</span>
                                    </div>
                                )}
                                {purchaseGroup.due_date && (Number(purchaseGroup.debt_amount) || 0) > 0 && (
                                    <div className="item" style={{ color: '#b91c1c' }}>
                                        <span>Échéance:</span>
                                        <span>{formatDate(purchaseGroup.due_date)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Products */}
                            <div className="section">
                                <div className="section-title">Produits ({purchaseGroup.items?.length || 0})</div>
                                {purchaseGroup.items?.map((item, index) => (
                                    <div key={index} style={{ marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                                            {item.product_name}
                                        </div>
                                        <div className="item" style={{ fontSize: '11px', paddingLeft: '10px' }}>
                                            <span>{item.quantity} {item.unit || ''} x {formatCurrency(item.unit_price)}</span>
                                            <span>{formatCurrency(item.total)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Total */}
                            <div className="total">
                                <div className="item" style={{ fontSize: '16px' }}>
                                    <span>TOTAL</span>
                                    <span>{formatCurrency(purchaseGroup.total_amount)}</span>
                                </div>
                            </div>

                            {/* Emballages rendus au fournisseur */}
                            {((Number(purchaseGroup.returned_bottles) || 0) > 0 || (Number(purchaseGroup.returned_crates) || 0) > 0) && (
                                <div className="section">
                                    <div className="divider"></div>
                                    <div className="section-title">Emballages rendus au fournisseur</div>
                                    {(Number(purchaseGroup.returned_bottles) || 0) > 0 && (
                                        <div className="item">
                                            <span>Bouteilles:</span>
                                            <span>{purchaseGroup.returned_bottles}</span>
                                        </div>
                                    )}
                                    {(Number(purchaseGroup.returned_crates) || 0) > 0 && (
                                        <div className="item">
                                            <span>Cageots:</span>
                                            <span>{purchaseGroup.returned_crates}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes */}
                            {purchaseGroup.notes && (
                                <div className="section">
                                    <div className="section-title">Notes</div>
                                    <div style={{ fontSize: '11px', fontStyle: 'italic' }}>{purchaseGroup.notes}</div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="footer">
                                <div style={{ marginTop: '5px' }}>Document d'approvisionnement</div>
                                <div style={{ fontSize: '9px', marginTop: '3px', color: '#666' }}>
                                    Powered by StandPOS
                                </div>
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
                            className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl shadow-lg shadow-blue-500/30"
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
