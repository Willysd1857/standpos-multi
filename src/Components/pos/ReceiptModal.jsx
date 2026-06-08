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
import { formatQuantity } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';

const paymentLabels = {
  cash: 'Espèces',
  mvola: 'MVola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money'
};

export default function ReceiptModal({ open, onClose, transaction }) {
  const { formatCurrency } = useCurrency();
  const { enableTables } = useAppSettings();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  const { formatDate } = useAppDate();

  const businessInfo = settings || {};

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=400,height=600');
    const receiptContent = document.getElementById('receipt-content');

    // Fix relative image paths for the new window
    let content = receiptContent.innerHTML;
    const origin = window.location.origin;
    content = content.replace(/src="\/uploads\//g, `src="${origin}/uploads/`);

    printWindow.document.write(`
      <html>
        <head>
          <title>Facture ${transaction?.reference}</title>
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
            .subtotal { font-size: 11px; margin-top: 5px; }
            .vip-charge { font-size: 11px; margin-top: 3px; color: #f59e0b; font-weight: 700; }
            .total { font-size: 14px; font-weight: 700; margin-top: 5px; padding-top: 5px; border-top: 2px solid #000; }
            .payment-info { margin-top: 8px; font-size: 11px; }
            .amount-due { color: #dc2626; font-weight: 700; background: #fee2e2; padding: 4px; border-radius: 4px; margin-top: 5px; }
            .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000; font-size: 10px; }
            .vip-badge { 
              background: linear-gradient(135deg, #fbbf24, #f59e0b);
              color: white;
              padding: 4px 10px;
              border-radius: 4px;
              display: inline-block;
              font-size: 10px;
              font-weight: 700;
              margin-top: 5px;
            }
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

  // Debug logging to understand why amount_given isn't showing
  useEffect(() => {
    if (transaction && open) {
      console.log('🧾 Receipt Transaction Data:', {
        payment_method: transaction.payment_method,
        amount_given: transaction.amount_given,
        total_amount: transaction.total_amount,
        shouldShow: String(transaction.payment_method).toLowerCase() === 'cash' && transaction.amount_given > 0
      });
    }
  }, [transaction, open]);

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
                <div className="header-info">
                  <div className="business-name">{businessInfo.business_name || 'StandPOS'}</div>
                  {businessInfo.business_address && <div className="info-line">{businessInfo.business_address}</div>}
                  {businessInfo.business_phone && <div className="info-line">Tél: {businessInfo.business_phone}</div>}
                  {businessInfo.nif && (
                    <div className="info-line">
                      NIF: {businessInfo.nif}
                    </div>
                  )}
                  {businessInfo.stat && (
                    <div className="info-line">
                      STAT: {businessInfo.stat}
                    </div>
                  )}
                </div>
                {businessInfo.business_logo && (
                  <img src={businessInfo.business_logo} alt="Logo" className="logo" />
                )}
              </div>

              {/* Transaction info */}
              <div className="section">
                <div className="item">
                  <span style={{ fontWeight: 'bold' }}>Facture N°: {transaction.reference}</span>
                </div>
                <div className="item">
                  <span>Date:</span>
                  <span>{formatDate(transaction.created_date)}</span>
                </div>
                {enableTables && transaction.table_number && (
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
                {enableTables && transaction.is_vip && (
                  <div style={{ textAlign: 'center' }}>
                    <span className="vip-badge">★ TABLE VIP ★</span>
                  </div>
                )}
                <div className="item">
                  <span>Paiement:</span>
                  <span>{paymentLabels[transaction.payment_method] || transaction.payment_method}</span>
                </div>
                {transaction.updated_at && (
                  <div className="item">
                    <span>Date règlement:</span>
                    <span style={{ fontWeight: 'bold' }}>{formatDate(transaction.updated_at)}</span>
                  </div>
                )}
                {transaction.transaction_ref && ['mvola', 'orange_money', 'airtel_money', 'visa'].includes(transaction.payment_method) && (
                  <div className="item">
                    <span>Réf. Transaction:</span>
                    <span style={{ fontWeight: 'bold' }}>{transaction.transaction_ref}</span>
                  </div>
                )}
              </div>



              {/* Items */}
              <div className="section">
                <div className="section-title">Articles</div>
                {transaction.items?.map((item, index) => (
                  <div key={index}>
                    <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                      {item.product_name}
                    </div>
                    <div className="item" style={{ fontSize: '11px', paddingLeft: '10px' }}>
                      <span>{formatQuantity(item.quantity, item.unit)} {item.unit} x {formatCurrency(item.unit_price)}</span>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                  </div>
                ))}
              </div>



              {/* Subtotal and VIP Charge */}
              {transaction.is_vip && businessInfo.vip_charge ? (
                <>
                  <div className="subtotal">
                    <div className="item">
                      <span>Sous-total</span>
                      <span>{formatCurrency((transaction.total_amount || 0) - (businessInfo.vip_charge || 0))}</span>
                    </div>
                  </div>
                  <div className="vip-charge">
                    <div className="item">
                      <span>★ Frais Table VIP</span>
                      <span>+{formatCurrency(businessInfo.vip_charge)}</span>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Total */}
              <div className="total">
                <div className="item" style={{ fontSize: '16px' }}>
                  <span>TOTAL</span>
                  <span>{formatCurrency(transaction.total_amount)}</span>
                </div>
              </div>

              {/* Payment Information */}
              {(transaction.amount_paid !== undefined || transaction.amount_due > 0) && (
                <div className="payment-info">
                  {transaction.is_debt_settlement && transaction.paid_now && (
                    <div style={{ marginBottom: '10px', padding: '8px', border: '1px solid #000', borderRadius: '4px', backgroundColor: '#f9fafb' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', color: '#111827' }}>
                        Règlement de dette
                      </div>
                      <div className="item">
                        <span>Montant versé:</span>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{formatCurrency(transaction.paid_now)}</span>
                      </div>
                      <div style={{ fontSize: '10px', fontStyle: 'italic', marginTop: '2px', color: '#4b5563' }}>
                        Régularisation pour la vente du {formatDate(transaction.created_date)}
                      </div>
                    </div>
                  )}


                  {transaction.amount_due > 0 && (
                    <div className="amount-due">
                      <div className="item">
                        <span>Reste à payer</span>
                        <span>{formatCurrency(transaction.amount_due)}</span>
                      </div>
                    </div>
                  )}

                  {/* Amount Given and Change - Only for cash payments */}
                  {String(transaction.payment_method).toLowerCase() === 'cash' && transaction.amount_given > 0 && (
                    <>
                      <div className="divider"></div>
                      <div className="item">
                        <span>Montant donné</span>
                        <span style={{ fontWeight: 'bold' }}>{formatCurrency(transaction.amount_given)}</span>
                      </div>
                      <div className="item" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        <span>Rendu</span>
                        <span>{formatCurrency(transaction.amount_given - transaction.total_amount)}</span>
                      </div>
                    </>
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
                <div style={{ marginTop: '5px' }}>Merci de votre visite !</div>
                <div style={{ fontSize: '9px', marginTop: '3px', color: '#666' }}>
                  Powered by StandPOS
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