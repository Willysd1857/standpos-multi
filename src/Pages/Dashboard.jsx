import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppDate } from '@/hooks/useAppDate';
import { motion } from 'framer-motion';
import {
    TrendingUp, DollarSign, TrendingDown, Users, Calendar,
    ArrowUpRight, ArrowDownRight, CalendarDays, FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
    startOfDay, endOfDay, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth, startOfYear, endOfYear,
    isWithinInterval, eachDayOfInterval, format
} from 'date-fns';
import { formatAmount } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';

const periods = [
    { id: 'daily', label: 'Jour' },
    { id: 'weekly', label: 'Semaine' },
    { id: 'monthly', label: 'Mois' },
    { id: 'annual', label: 'Année' },
    { id: 'custom', label: 'Personnalisé' }
];

const safeParse = (d) => {
    if (!d) return null;
    if (typeof d === 'string' && d.length === 10) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day);
    }
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date;
};

export default function Dashboard() {
    const { formatDate } = useAppDate();
    const { formatCurrency } = useCurrency();
    const [selectedPeriod, setSelectedPeriod] = useState('weekly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { data: allTransactions = [] } = useQuery({
        queryKey: ['transactions'],
        queryFn: () => base44.entities.Transaction.list()
    });

    const { data: allExpenses = [] } = useQuery({
        queryKey: ['expenses'],
        queryFn: () => base44.entities.Expense.list()
    });

    const { data: allPurchases = [] } = useQuery({
        queryKey: ['purchases'],
        queryFn: () => base44.entities.Purchase.list()
    });

    const { data: allPurchaseGroups = [] } = useQuery({
        queryKey: ['purchase-groups'],
        queryFn: () => base44.entities.PurchaseGroup.list()
    });

    const { data: allProducts = [] } = useQuery({
        queryKey: ['products'],
        queryFn: () => base44.entities.Product.list()
    });

    const { data: allPayments = [] } = useQuery({
        queryKey: ['payments'],
        queryFn: () => base44.entities.Payment.list()
    });

    const filteredData = useMemo(() => {
        const now = new Date();
        let start = startOfDay(now);
        let end = endOfDay(now);

        switch (selectedPeriod) {
            case 'daily':
                start = startOfDay(now);
                end = endOfDay(now);
                break;
            case 'weekly':
                start = startOfWeek(now, { weekStartsOn: 1 });
                end = endOfWeek(now, { weekStartsOn: 1 });
                break;
            case 'monthly':
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
            case 'annual':
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            case 'custom':
                if (startDate && endDate) {
                    start = startOfDay(new Date(startDate));
                    end = endOfDay(new Date(endDate));
                }
                break;
        }

        const transactions = allTransactions.filter(t => {
            const dateStr = t.created_date || t.created_at;
            if (!dateStr) return false;
            return isWithinInterval(safeParse(dateStr), { start, end });
        });

        const expenses = allExpenses.filter(e => {
            if (!e.date) return false;
            return isWithinInterval(safeParse(e.date), { start, end });
        });

        const purchases = allPurchases.filter(p => {
            const date = p.date || p.created_at;
            if (!date) return false;
            return isWithinInterval(safeParse(date), { start, end });
        });

        const purchaseGroups = allPurchaseGroups.filter(pg => {
            const date = pg.date || pg.created_at;
            if (!date) return false;
            return isWithinInterval(safeParse(date), { start, end });
        });

        const payments = allPayments.filter(p => {
            if (!p.created_at) return false;
            return isWithinInterval(safeParse(p.created_at), { start, end });
        });

        return { transactions, expenses, purchases, purchaseGroups, payments, start, end };
    }, [selectedPeriod, startDate, endDate, allTransactions, allExpenses, allPurchases, allPurchaseGroups, allPayments]);

    const stats = useMemo(() => {
        const validTransactions = filteredData.transactions.filter(t => t.status === 'validated');
        const transactionsWithItems = validTransactions.filter(t => t.type === 'vente');
        const refundTransactions = validTransactions.filter(t => t.type === 'remboursement_consigne');
        
        // Total revenue includes sales AND deposit refunds (which are negative)
        const totalRevenue = validTransactions.filter(t => t.type === 'vente' || t.type === 'remboursement_consigne')
            .reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

        // Calculate COGS
        const cogs = transactionsWithItems.reduce((totalCogs, t) => {
            try {
                const items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || []);
                const txCogs = items.reduce((sum, item) => {
                    // Try to use stored cost_price first, then fall back to product list
                    let costPrice = Number(item.cost_price);
                    if (isNaN(costPrice) || costPrice === 0) {
                        const product = allProducts.find(p => p.id === item.product_id);
                        costPrice = Number(product?.cost_price) || 0;
                    }
                    return sum + (costPrice * (Number(item.quantity) || 0));
                }, 0);
                return totalCogs + txCogs;
            } catch (e) {
                return totalCogs;
            }
        }, 0);

        const grossMargin = totalRevenue - cogs;
        // Refunds are negative, so adding them deducts from totalSales
        const totalSales = filteredData.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) +
                           refundTransactions.reduce((sum, t) => sum + (Number(t.amount_paid) || 0), 0);
        const operationalExpenses = filteredData.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const purchaseExpenses = filteredData.purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
        const purchaseGroupExpenses = filteredData.purchaseGroups.reduce((sum, pg) => sum + (Number(pg.total_amount) || 0), 0);
        const totalExpenses = operationalExpenses + purchaseExpenses + purchaseGroupExpenses;
        const totalVisitors = transactionsWithItems.length;
        const totalBalance = totalSales - totalExpenses;
        const totalDebt = transactionsWithItems.reduce((sum, t) => sum + (Number(t.amount_due) || 0), 0);

        return { totalRevenue, totalSales, totalExpenses, totalVisitors, totalBalance, totalDebt, grossMargin, cogs };
    }, [filteredData, allProducts]);

    const chartData = useMemo(() => {
        if (!filteredData.start || !filteredData.end) return [];

        try {
            const days = eachDayOfInterval({ start: filteredData.start, end: filteredData.end });
            const dataMap = new Map();

            days.forEach(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                dataMap.set(dateKey, { date: dateKey, sales: 0, expenses: 0, cogs: 0 });
            });

            filteredData.payments.forEach(p => {
                const d = safeParse(p.created_at);
                if (!d) return;
                const dateKey = format(d, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).sales += Number(p.amount) || 0;
                }
            });

            filteredData.transactions.forEach(t => {
                if (t.status !== 'validated') return;
                
                if (t.type === 'remboursement_consigne') {
                    const d = safeParse(t.created_date || t.created_at);
                    if (!d) return;
                    const dateKey = format(d, 'yyyy-MM-dd');
                    if (dataMap.has(dateKey)) {
                        dataMap.get(dateKey).sales += Number(t.amount_paid) || 0;
                    }
                } else if (t.type === 'vente') {
                    const d = safeParse(t.created_date || t.created_at);
                    if (!d) return;
                    const dateKey = format(d, 'yyyy-MM-dd');
                    if (dataMap.has(dateKey)) {
                        try {
                            const items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || []);
                            const txCogs = items.reduce((sum, item) => {
                                let costPrice = Number(item.cost_price);
                                if (isNaN(costPrice) || costPrice === 0) {
                                    const product = allProducts.find(p => p.id === item.product_id);
                                    costPrice = Number(product?.cost_price) || 0;
                                }
                                return sum + (costPrice * (Number(item.quantity) || 0));
                            }, 0);
                            dataMap.get(dateKey).cogs += txCogs;
                        } catch (e) { }
                    }
                }
            });

            filteredData.expenses.forEach(e => {
                const d = safeParse(e.date);
                if (!d) return;
                const dateKey = format(d, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(e.amount) || 0;
                }
            });

            filteredData.purchases.forEach(p => {
                const d = safeParse(p.date || p.created_at);
                if (!d) return;
                const dateKey = format(d, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(p.total_amount) || 0;
                }
            });

            filteredData.purchaseGroups.forEach(pg => {
                const d = safeParse(pg.date || pg.created_at);
                if (!d) return;
                const dateKey = format(d, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(pg.total_amount) || 0;
                }
            });

            return Array.from(dataMap.values()).map(item => ({
                ...item,
                profit: item.sales - item.expenses,
                grossProfit: item.sales - item.cogs // Or revenue - cogs? usually it's tied to sales volume
            }));
        } catch (e) {
            console.error("Error generating chart data", e);
            return [];
        }
    }, [filteredData]);

    const kpiCards = useMemo(() => [
        {
            title: 'Solde Disponible',
            value: stats.totalBalance,
            icon: DollarSign,
            bgColor: 'bg-gradient-to-br from-[#0F766E] to-[#14B8A6]',
            iconBg: 'bg-white/20',
            desc: 'Total Payé - Dépenses'
        },
        {
            title: 'Marge Brut (Bénéfices)',
            value: stats.grossMargin,
            icon: ArrowUpRight,
            bgColor: 'bg-gradient-to-br from-[#059669] to-[#10B981]',
            iconBg: 'bg-white/20',
            desc: 'Ventes - Prix d\'achat'
        },
        {
            title: 'Chiffre d\'Affaires',
            value: stats.totalRevenue,
            icon: TrendingUp,
            bgColor: 'bg-gradient-to-br from-[#7E22CE] to-[#A855F7]',
            iconBg: 'bg-white/20',
            desc: 'Total des ventes validées'
        },
        {
            title: 'Total des Impayés',
            value: stats.totalDebt,
            icon: Users,
            bgColor: 'bg-gradient-to-br from-[#374151] to-[#4B5563]',
            iconBg: 'bg-white/20',
            desc: 'Dettes clients à recouvrir'
        }
    ], [stats]);

    const xAxisFormatter = useCallback((str) => {
        if (!str) return '';
        const parts = str.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : str;
    }, []);

    const tooltipLabelFormatter = useCallback((label) => {
        if (!label) return '';
        const parts = label.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : label;
    }, []);

    const tooltipFormatter = useCallback((value, name) => [`${formatCurrency(value)}`, name], [formatCurrency]);

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-gray-500 mt-1">Vue d'ensemble de votre activité</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/reports">
                            <Button className="bg-white hover:bg-white/90 text-gray-700 border-none rounded-xl gap-2 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] h-10 px-5 transition-all active:scale-95">
                                <FileText className="w-4 h-4 text-blue-600" />
                                <span className="font-semibold text-sm">Rapport Journalier</span>
                            </Button>
                        </Link>
                        <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod} className="bg-white/80 backdrop-blur-md rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] p-1">
                            <TabsList className="bg-transparent gap-1">
                                {periods.map((period) => (
                                    <TabsTrigger
                                        key={period.id}
                                        value={period.id}
                                        className="rounded-lg px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-gray-500"
                                    >
                                        {period.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                {selectedPeriod === 'custom' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-white rounded-xl shadow-sm p-4">
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">Date de début</label>
                                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl" />
                            </div>
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">Date de fin</label>
                                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl" />
                            </div>
                        </div>
                    </motion.div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpiCards.map((card, index) => (
                        <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                            <Card className={`${card.bgColor} border-0 text-white overflow-hidden relative rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]`}>
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-white/80 text-sm font-medium mb-2">{card.title}</p>
                                            <p className="text-3xl font-bold mb-1">
                                                {formatCurrency(card.value)}
                                            </p>
                                            <div className="flex items-center gap-1 text-white/90 text-xs mt-2">
                                                <CalendarDays className="w-3 h-3" />
                                                <span>{card.desc || 'Mis à jour à l\'instant'}</span>
                                            </div>
                                        </div>
                                        <div className={`${card.iconBg} p-3 rounded-xl`}>
                                            <card.icon className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="border-0 shadow-[0_8px_40px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                        <CardHeader className="border-b border-gray-50 bg-white p-6 pb-2">
                            <CardTitle className="text-lg font-bold text-gray-800">Ventes vs Dépenses</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={xAxisFormatter} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `${(value / 1000)}k`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.98)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }}
                                            itemStyle={{ fontSize: '12px', fontWeight: '600' }}
                                            formatter={tooltipFormatter}
                                            labelFormatter={tooltipLabelFormatter}
                                        />
                                        <Legend verticalAlign="top" align="right" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '30px', fontSize: '11px', fontWeight: '600' }} />
                                        <Area type="monotone" dataKey="sales" name="Recettes (Ventes)" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" animationDuration={1500} />
                                        <Area type="monotone" dataKey="expenses" name="Dépenses Total" stroke="#ef4444" strokeWidth={4} fillOpacity={1} fill="url(#colorExpenses)" animationDuration={1500} />
                                        <Area type="monotone" dataKey="grossProfit" name="Marge Brut" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorProfit)" animationDuration={1500} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-[0_8px_40px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                        <CardHeader className="border-b border-gray-50 bg-white p-6 pb-2">
                            <CardTitle className="text-lg font-bold text-gray-800">Activité Récente</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 bg-[#ECFDF5] rounded-2xl">
                                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                                        <TrendingUp className="w-6 h-6 text-[#065F46]" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-[#065F46]">Ventes du jour</p>
                                        <p className="text-xs text-[#065F46]/60">{stats.totalVisitors} transactions</p>
                                    </div>
                                    <span className="text-lg font-bold text-[#065F46]">{formatCurrency(stats.totalRevenue)}</span>
                                </div>
                                <div className="flex items-center gap-4 p-4 bg-[#FEF2F2] rounded-2xl">
                                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                                        <TrendingDown className="w-6 h-6 text-[#991B1B]" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-[#991B1B]">Dépenses du jour</p>
                                        <p className="text-xs text-[#991B1B]/60">{filteredData.expenses.length} dépenses</p>
                                    </div>
                                    <span className="text-lg font-bold text-[#991B1B]">{formatCurrency(stats.totalExpenses)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
