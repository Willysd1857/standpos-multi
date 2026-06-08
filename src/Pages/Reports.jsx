import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    FileText, Download, Calendar as CalendarIcon,
    TrendingUp, TrendingDown, Package, AlertCircle,
    BarChart3, CreditCard, ShoppingBag, PieChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatAmount } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function Reports() {
    const { formatCurrency } = useCurrency();
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    const { data: report, isLoading, error } = useQuery({
        queryKey: ['daily-report', selectedDate],
        queryFn: () => base44.entities.Reports.getDaily(selectedDate),
    });

    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => base44.entities.Settings.get()
    });

    const generatePDF = () => {
        try {
            if (!report) {
                toast.error("Données du rapport non disponibles");
                return;
            }

            console.log("Generating PDF for date:", selectedDate, report);

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;
            const businessName = settings?.business_name || 'StandPOS';

            // Header
            doc.setFontSize(22);
            doc.setTextColor(40, 40, 40);
            doc.text(`RAPPORT JOURNALIER`, pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(14);
            doc.text(`${businessName}`, pageWidth / 2, 30, { align: 'center' });

            doc.setFontSize(11);
            doc.setTextColor(100, 100, 100);

            let dateObj;
            try {
                dateObj = new Date(selectedDate);
            } catch (e) {
                dateObj = new Date();
            }

            const displayDate = format(dateObj, 'EEEE dd MMMM yyyy', { locale: fr });
            doc.text(`Date : ${displayDate}`, pageWidth / 2, 38, { align: 'center' });

            doc.setDrawColor(200, 200, 200);
            doc.line(20, 45, pageWidth - 20, 45);

            // Summary Section
            doc.setFontSize(14);
            doc.setTextColor(30, 30, 30);
            doc.text('RÉSUMÉ FINANCIER', 20, 55);

            const summaryData = [
                ['Chiffre d\'Affaires (Ventes)', `${formatCurrency(report.summary.revenue)}`],
                ['Total Payé (Cash Encaisse)', `${formatCurrency(report.summary.total_paid)}`],
                ['Reste à Payé (Dettes)', `${formatCurrency(report.summary.total_due)}`],
                ['Dépenses du Jour', `${formatCurrency(report.summary.total_expenses)}`],
                ['Marge Bénéficiaire (Marge Brute)', `${formatCurrency(report.summary.gross_margin)}`],
                ['Solde en Caisse (Payé - Dépenses)', `${formatCurrency(report.summary.net_profit)}`]
            ];

            autoTable(doc, {
                startY: 60,
                head: [['Poste', 'Montant']],
                body: summaryData,
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                styles: { fontSize: 10 }
            });

            let currentY = doc.lastAutoTable.finalY + 15;

            // Best Sellers
            doc.setFontSize(14);
            doc.text('TOP 10 VENTES (Quantité)', 20, currentY);

            const bestSellersBody = (report.best_sellers || []).map(item => [
                item.name || 'Inconnu',
                item.quantity || 0,
                `${formatCurrency(item.revenue)}`
            ]);

            autoTable(doc, {
                startY: currentY + 5,
                head: [['Produit', 'Quantité', 'Chiffre d\'Affaires']],
                body: bestSellersBody,
                theme: 'grid',
                headStyles: { fillColor: [39, 174, 96] },
                styles: { fontSize: 9 }
            });

            currentY = doc.lastAutoTable.finalY + 15;

            // Most Profitable
            if (report.most_profitable && report.most_profitable.length > 0) {
                if (currentY > 230) { doc.addPage(); currentY = 20; }
                doc.setFontSize(14);
                doc.text('PRODUITS LES PLUS RENTABLES', 20, currentY);

                const profitableBody = report.most_profitable.map(item => [
                    item.name || 'Inconnu',
                    item.quantity || 0,
                    `${formatCurrency(item.revenue)}`,
                    `${formatCurrency(item.profit)}`
                ]);

                autoTable(doc, {
                    startY: currentY + 5,
                    head: [['Produit', 'Quantité', 'Chiffre d\'Affaires', 'Marge Estimée']],
                    body: profitableBody,
                    theme: 'grid',
                    headStyles: { fillColor: [52, 152, 219] },
                    styles: { fontSize: 9 }
                });
                currentY = doc.lastAutoTable.finalY + 15;
            }

            // Expenses Section
            if (report.expenses && report.expenses.length > 0) {
                if (currentY > 230) { doc.addPage(); currentY = 20; }
                doc.setFontSize(14);
                doc.text('DÉPENSES DU JOUR', 20, currentY);

                const expensesBody = report.expenses.map(e => [
                    e.description || '-',
                    e.category || '-',
                    e.payment_method || '-',
                    `${formatCurrency(e.amount)}`
                ]);

                autoTable(doc, {
                    startY: currentY + 5,
                    head: [['Description', 'Catégorie', 'Mode', 'Montant']],
                    body: expensesBody,
                    theme: 'striped',
                    headStyles: { fillColor: [231, 76, 60] },
                    styles: { fontSize: 9 }
                });
                currentY = doc.lastAutoTable.finalY + 15;
            }

            // Stock Alerts
            const hasStockAlerts = (report.stock_alerts?.products?.length > 0) || (report.stock_alerts?.ingredients?.length > 0);
            if (hasStockAlerts) {
                if (currentY > 230) { doc.addPage(); currentY = 20; }
                doc.setFontSize(14);
                doc.text('ALERTES STOCK FAIBLE', 20, currentY);

                const stockBody = [
                    ...(report.stock_alerts?.products || []).map(p => [p.name, p.stock, p.min_stock, p.unit, 'Produit']),
                    ...(report.stock_alerts?.ingredients || []).map(i => [i.name, i.stock, i.min_stock, i.unit, 'Ingrédient'])
                ];

                autoTable(doc, {
                    startY: currentY + 5,
                    head: [['Article', 'Stock Actuel', 'Min', 'Unité', 'Type']],
                    body: stockBody,
                    theme: 'grid',
                    headStyles: { fillColor: [243, 156, 18] },
                    styles: { fontSize: 9 }
                });
                currentY = doc.lastAutoTable.finalY + 15;
            }

            // Ingredient Usage
            if (report.ingredient_usage && report.ingredient_usage.length > 0) {
                if (currentY > 230) { doc.addPage(); currentY = 20; }
                doc.setFontSize(14);
                doc.text('UTILISATION DES INGRÉDIENTS', 20, currentY);

                const usageBody = report.ingredient_usage.map(u => [
                    u.ingredient_name || 'Inconnu',
                    u.total_used || 0
                ]);

                autoTable(doc, {
                    startY: currentY + 5,
                    head: [['Ingrédient', 'Quantité Utilisée']],
                    body: usageBody,
                    theme: 'striped',
                    headStyles: { fillColor: [155, 89, 182] },
                    styles: { fontSize: 9 }
                });
            }

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Page ${i}/${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
            }

            doc.save(`Rapport_${selectedDate}.pdf`);
            toast.success('Rapport PDF généré avec succès');
        } catch (err) {
            console.error('Error generating PDF:', err);
            toast.error(`Erreur lors de la génération du PDF: ${err.message}`);
        }
    };

    if (error) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold">Erreur lors de la récupération du rapport</h2>
                <p className="text-gray-500">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-8 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <FileText className="w-8 h-8 text-blue-600" />
                        Rapport Journalier
                    </h1>
                    <p className="text-gray-500">Consultez et exportez la performance de votre journée</p>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                    <CalendarIcon className="w-5 h-5 text-gray-400 ml-2" />
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border-none focus-visible:ring-0 w-40"
                    />
                    <Button
                        onClick={generatePDF}
                        disabled={isLoading || !report}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 shadow-lg shadow-blue-500/30"
                    >
                        <Download className="w-4 h-4" />
                        Exporter PDF
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-2xl" />
                    ))}
                </div>
            ) : (
                <>
                    {/* Top Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="rounded-2xl border-none shadow-md overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                            <CardContent className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-blue-100 text-sm font-medium">Ventes Totales</p>
                                        <h3 className="text-2xl font-bold mt-1">{formatCurrency(report.summary.revenue)}</h3>
                                    </div>
                                    <div className="bg-white/20 p-2 rounded-xl">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className="text-blue-100 text-[10px] mt-4">{report.summary.transaction_count} transactions</p>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-none shadow-md overflow-hidden bg-white">
                            <CardContent className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-gray-500 text-sm font-medium">Dépenses Totales</p>
                                        <h3 className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(report.summary.total_expenses)}</h3>
                                    </div>
                                    <div className="bg-red-50 p-2 rounded-xl">
                                        <TrendingDown className="w-5 h-5 text-red-600" />
                                    </div>
                                </div>
                                <p className="text-gray-400 text-[10px] mt-4">
                                    {report.expenses.length} opérationnelles + {report.purchases.length} achats
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-none shadow-md overflow-hidden bg-white">
                            <CardContent className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-gray-500 text-sm font-medium">Sold Disponible en Caisse</p>
                                        <h3 className={`text-2xl font-bold mt-1 ${report.summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(report.summary.net_profit)}
                                        </h3>
                                    </div>
                                    <div className="bg-green-50 p-2 rounded-xl">
                                        <BarChart3 className="w-5 h-5 text-green-600" />
                                    </div>
                                </div>
                                <p className="text-gray-400 text-[10px] mt-4">Cash en main (Total Payé - Total Dépenses)</p>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-none shadow-md overflow-hidden bg-white">
                            <CardContent className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-gray-500 text-sm font-medium">Marge Bénéficiaire</p>
                                        <h3 className="text-2xl font-bold mt-1 text-indigo-600">
                                            {formatCurrency(report.summary.gross_margin)}
                                        </h3>
                                    </div>
                                    <div className="bg-indigo-50 p-2 rounded-xl">
                                        <ShoppingBag className="w-5 h-5 text-indigo-600" />
                                    </div>
                                </div>
                                <p className="text-gray-400 text-[10px] mt-4">Marge brute (Ventes - Coût d'achat)</p>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-none shadow-md overflow-hidden bg-white">
                            <CardContent className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-gray-500 text-sm font-medium">Crédits</p>
                                        <h3 className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(report.summary.total_due)}</h3>
                                    </div>
                                    <div className="bg-orange-50 p-2 rounded-xl">
                                        <CreditCard className="w-5 h-5 text-orange-600" />
                                    </div>
                                </div>
                                <p className="text-gray-400 text-[10px] mt-4">Reste à encaisser</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Best Sellers */}
                        <Card className="rounded-2xl border-none shadow-md bg-white">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg font-bold flex items-center gap-2">
                                    <PieChart className="w-5 h-5 text-blue-600" />
                                    Produits les plus vendus
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {report.best_sellers.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-6 h-6 rounded-full bg-gray-100 text-[10px] flex items-center justify-center font-bold text-gray-500">
                                                    {i + 1}
                                                </span>
                                                <span className="font-medium text-gray-700">{item.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-800">{item.quantity} vendus</p>
                                                <p className="text-xs text-gray-400">{formatCurrency(item.revenue)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {report.best_sellers.length === 0 && (
                                        <p className="text-center py-8 text-gray-400 italic">Aucune vente pour cette période</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Stock and Usage Info */}
                        <div className="space-y-6">
                            {/* Stock Alerts Card */}
                            <Card className="rounded-2xl border-none shadow-md bg-white">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-orange-600">
                                        <AlertCircle className="w-5 h-5" />
                                        Alertes Stock {report.stock_alerts.products.length + report.stock_alerts.ingredients.length > 0 &&
                                            <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full">
                                                {report.stock_alerts.products.length + report.stock_alerts.ingredients.length}
                                            </span>
                                        }
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {[...report.stock_alerts.products, ...report.stock_alerts.ingredients].slice(0, 5).map((item, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-orange-50/50 border border-orange-100">
                                                <span className="font-medium text-gray-700 text-sm">{item.name}</span>
                                                <span className="text-xs font-bold text-red-600">
                                                    {item.stock} / {item.min_stock} {item.unit}
                                                </span>
                                            </div>
                                        ))}
                                        {report.stock_alerts.products.length + report.stock_alerts.ingredients.length === 0 && (
                                            <p className="text-center py-4 text-emerald-600 text-sm font-medium">✅ Tout est en stock!</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Purchases and Usage */}
                            <Card className="rounded-2xl border-none shadow-md bg-white">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                                        <ShoppingBag className="w-5 h-5 text-purple-600" />
                                        Approvisionnements du Jour
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {report.purchases.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm">
                                                <div>
                                                    <p className="font-semibold text-gray-700">{p.reference}</p>
                                                    <p className="text-xs text-gray-400">{p.supplier_name || 'Fournisseur inconnu'}</p>
                                                </div>
                                                <span className="font-bold text-purple-600">{formatCurrency(p.total_amount)}</span>
                                            </div>
                                        ))}
                                        {report.purchases.length === 0 && (
                                            <p className="text-center py-4 text-gray-400 italic text-sm">Aucun achat aujourd'hui</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
