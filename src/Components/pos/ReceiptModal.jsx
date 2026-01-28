import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAppDate } from '@/hooks/useAppDate';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Printer, X, Download, Crown, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const paymentLabels = {
  cash: 'Espèces',
  mvola: 'MVola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money'
};

export default function ReceiptModal({ open, onClose, transaction }) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const { formatDate } = useAppDate();

  const businessInfo = settings || {};

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=400,height=600');
    const receiptContent = document.getElementById('receipt-content');

    printWindow.document.write(`
      <html>
        <head>
          <title>Facture ${transaction?.reference}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              padding: 20px;
              font-size: 12px;
              line-height: 1.4;
            }
            .receipt { max-width: 300px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 15px; }
            .logo { max-width: 80px; margin: 0 auto 10px; }
            .business-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
            .info-line { font-size: 11px; margin: 2px 0; }
            .section { margin: 15px 0; }
            .section-title { font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-size: 11px; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; }
            .divider { border-top: 1px dashed #666; margin: 10px 0; }
            .subtotal { font-size: 12px; margin-top: 10px; }
            .vip-charge { font-size: 12px; margin-top: 5px; color: #f59e0b; font-weight: bold; }
            .total { font-size: 14px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 2px solid #000; }
            .payment-info { margin-top: 15px; padding-top: 15px; border-top: 1px dashed #666; font-size: 12px; }
            .amount-due { color: #dc2626; font-weight: bold; background: #fee2e2; padding: 5px; border-radius: 4px; margin-top: 5px; }
            .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 2px dashed #000; font-size: 11px; }
            .vip-badge { 
              background: linear-gradient(135deg, #fbbf24, #f59e0b);
              color: white;
              padding: 4px 10px;
              border-radius: 4px;
              display: inline-block;
              font-size: 10px;
              font-weight: bold;
              margin-top: 5px;
            }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          ${receiptContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white">
        <div className="space-y-4">
          {/* Success animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center py-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-3 shadow-lg"
            >
              <CheckCircle className="w-10 h-10 text-white" />
            </motion.div>
            <h3 className="text-xl font-bold text-gray-800">Paiement réussi !</h3>
            <p className="text-sm text-gray-500">Transaction validée</p>
          </motion.div>

          {/* Receipt preview */}
          <div className="bg-gray-50 rounded-2xl p-6 border-2 border-gray-200 max-h-[400px] overflow-y-auto">
            <div id="receipt-content" className="receipt">
              {/* Header */}
              <div className="header">
                {businessInfo.business_logo && (
                  <img src={businessInfo.business_logo} alt="Logo" className="logo" />
                )}
                <div className="business-name">{businessInfo.business_name || 'Moonlight Snack-Bar'}</div>
                <div className="info-line">Antsirabe • Tél: 0345678901 • Email: moonlight@gmail.com</div>
                <div className="info-line">NIF: 123456789 • STAT: 111023456789</div>
              </div>

              {/* Transaction info */}
              <div className="section">
                <div className="item">
                  <span>Facture N°:</span>
                  <span style={{ fontWeight: 'bold' }}>{transaction.reference}</span>
                </div>
                <div className="item">
                  <span>Date:</span>
                  <span>{formatDate(transaction.created_date)}</span>
                </div>
                {transaction.table_number && (
                  <div className="item">
                    <span>Table:</span>
                    <span style={{ fontWeight: 'bold' }}>{transaction.table_number}</span>
                  </div>
                )}
                {transaction.partner_name && (
                  <div className="item">
                    <span>Client:</span>
                    <span>{transaction.partner_name}</span>
                  </div>
                )}
                {transaction.phone_number && (
                  <div className="item">
                    <span>Tél:</span>
                    <span>{transaction.phone_number}</span>
                  </div>
                )}
                {transaction.is_vip && (
                  <div style={{ textAlign: 'center' }}>
                    <span className="vip-badge">★ TABLE VIP ★</span>
                  </div>
                )}
                <div className="item">
                  <span>Paiement:</span>
                  <span>{paymentLabels[transaction.payment_method] || transaction.payment_method}</span>
                </div>
                {transaction.transaction_ref && ['mvola', 'orange_money', 'airtel_money', 'visa'].includes(transaction.payment_method) && (
                  <div className="item">
                    <span>Réf. Transaction:</span>
                    <span style={{ fontWeight: 'bold' }}>{transaction.transaction_ref}</span>
                  </div>
                )}
              </div>

              <div className="divider"></div>

              {/* Items */}
              <div className="section">
                <div className="section-title">Articles</div>
                {transaction.items?.map((item, index) => (
                  <div key={index}>
                    <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                      {item.product_name}
                    </div>
                    <div className="item" style={{ fontSize: '11px', paddingLeft: '10px' }}>
                      <span>{item.quantity} x {item.unit_price?.toLocaleString()} Ar</span>
                      <span>{item.total?.toLocaleString()} Ar</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="divider"></div>

              {/* Subtotal and VIP Charge */}
              {transaction.is_vip && businessInfo.vip_charge ? (
                <>
                  <div className="subtotal">
                    <div className="item">
                      <span>Sous-total</span>
                      <span>{((transaction.total_amount || 0) - (businessInfo.vip_charge || 0)).toLocaleString()} Ar</span>
                    </div>
                  </div>
                  <div className="vip-charge">
                    <div className="item">
                      <span>★ Frais Table VIP</span>
                      <span>+{businessInfo.vip_charge?.toLocaleString()} Ar</span>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Total */}
              <div className="total">
                <div className="item" style={{ fontSize: '16px' }}>
                  <span>TOTAL</span>
                  <span>{transaction.total_amount?.toLocaleString()} Ar</span>
                </div>
              </div>

              {/* Payment Information */}
              {(transaction.amount_paid !== undefined || transaction.amount_due > 0) && (
                <div className="payment-info">
                  <div className="item">
                    <span>Montant payé</span>
                    <span>{(transaction.amount_paid || 0).toLocaleString()} Ar</span>
                  </div>
                  {transaction.amount_due > 0 && (
                    <div className="amount-due">
                      <div className="item">
                        <span>Reste à payer</span>
                        <span>{transaction.amount_due.toLocaleString()} Ar</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="footer">
                {businessInfo.receipt_footer && (
                  <div style={{ marginBottom: '10px', fontStyle: 'italic' }}>
                    {businessInfo.receipt_footer}
                  </div>
                )}
                <div>───────────────────</div>
                <div style={{ marginTop: '5px' }}>Merci de votre visite !</div>
                <div style={{ fontSize: '10px', marginTop: '5px', color: '#666' }}>
                  Powered by Moonlight POS
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl"
            >
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