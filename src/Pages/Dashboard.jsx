import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppDate } from '@/hooks/useAppDate';
import { motion } from 'framer-motion';
import {
    TrendingUp, DollarSign, TrendingDown, Users, Calendar,
    ArrowUpRight, ArrowDownRight, CalendarDays
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const periods = [
    { id: 'daily', label: 'Jour' },
    { id: 'weekly', label: 'Semaine' },
    { id: 'monthly', label: 'Mois' },
    { id: 'annual', label: 'Année' },
    { id: 'custom', label: 'Personnalisé' }
];

import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO, eachDayOfInterval, format } from 'date-fns';

export default function Dashboard() {
    const { formatDate } = useAppDate();
    const [selectedPeriod, setSelectedPeriod] = useState('monthly');
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
        queryFn: async () => {
            const res = await fetch('http://localhost:3001/api/purchases');
            return res.ok ? res.json() : [];
        }
    });

    const { data: allPurchaseGroups = [] } = useQuery({
        queryKey: ['purchase-groups'],
        queryFn: async () => {
            const res = await fetch('http://localhost:3001/api/purchase-groups');
            return res.ok ? res.json() : [];
        }
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
            if (!t.created_date) return false;
            return isWithinInterval(new Date(t.created_date), { start, end });
        });

        const expenses = allExpenses.filter(e => {
            if (!e.date) return false;
            return isWithinInterval(new Date(e.date), { start, end });
        });

        const purchases = allPurchases.filter(p => {
            const date = p.date || p.created_at;
            if (!date) return false;
            return isWithinInterval(new Date(date), { start, end });
        });

        const purchaseGroups = allPurchaseGroups.filter(pg => {
            const date = pg.date || pg.created_at;
            if (!date) return false;
            return isWithinInterval(new Date(date), { start, end });
        });

        return { transactions, expenses, purchases, purchaseGroups, start, end };
    }, [selectedPeriod, startDate, endDate, allTransactions, allExpenses, allPurchases, allPurchaseGroups]);

    const stats = useMemo(() => {
        const validTransactions = filteredData.transactions.filter(t => t.type === 'vente' && t.status === 'validated');

        const totalSales = validTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);

        // Inclure les dépenses opérationnelles
        const operationalExpenses = filteredData.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        // Inclure les achats d'approvisionnement
        const purchaseExpenses = filteredData.purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
        const purchaseGroupExpenses = filteredData.purchaseGroups.reduce((sum, pg) => sum + (Number(pg.total_amount) || 0), 0);

        const totalExpenses = operationalExpenses + purchaseExpenses + purchaseGroupExpenses;
        const totalVisitors = validTransactions.length;
        const totalBalance = totalSales - totalExpenses;

        return { totalSales, totalExpenses, totalVisitors, totalBalance };
    }, [filteredData]);

    const chartData = useMemo(() => {
        if (!filteredData.start || !filteredData.end) return [];

        try {
            const days = eachDayOfInterval({ start: filteredData.start, end: filteredData.end });
            const dataMap = new Map();

            // Initialize all days
            days.forEach(day => {
                const dateKey = formatDate(day, 'yyyy-MM-dd');
                dataMap.set(dateKey, { date: dateKey, sales: 0, expenses: 0 });
            });

            // Process transactions
            filteredData.transactions.forEach(t => {
                if (t.type === 'vente' && t.status === 'validated') {
                    // Extract date part only, robustly
                    const dateObj = new Date(t.created_date);
                    if (isNaN(dateObj.getTime())) return;

                    const dateKey = formatDate(dateObj, 'yyyy-MM-dd');
                    if (dataMap.has(dateKey)) {
                        dataMap.get(dateKey).sales += t.total_amount || 0;
                    }
                }
            });

            // Process expenses
            filteredData.expenses.forEach(e => {
                const dateObj = new Date(e.date);
                if (isNaN(dateObj.getTime())) return;

                const dateKey = formatDate(dateObj, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(e.amount) || 0;
                }
            });

            // Process purchases
            filteredData.purchases.forEach(p => {
                const dateObj = new Date(p.date || p.created_at);
                if (isNaN(dateObj.getTime())) return;

                const dateKey = formatDate(dateObj, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(p.total_amount) || 0;
                }
            });

            // Process purchase groups
            filteredData.purchaseGroups.forEach(pg => {
                const dateObj = new Date(pg.date || pg.created_at);
                if (isNaN(dateObj.getTime())) return;

                const dateKey = formatDate(dateObj, 'yyyy-MM-dd');
                if (dataMap.has(dateKey)) {
                    dataMap.get(dateKey).expenses += Number(pg.total_amount) || 0;
                }
            });

            return Array.from(dataMap.values()).map(item => ({
                ...item,
                profit: item.sales - item.expenses
            }));
        } catch (e) {
            console.error("Error generating chart data", e);
            return [];
        }
    }, [filteredData]);

    const kpiCards = useMemo(() => [
        {
            title: 'Solde Total',
            value: stats.totalBalance,
            icon: DollarSign,
            bgColor: 'bg-gradient-to-br from-teal-700 to-teal-800',
            iconBg: 'bg-white/20'
        },
        {
            title: 'Chiffre d\'affaires',
            value: stats.totalSales,
            icon: TrendingUp,
            bgColor: 'bg-gradient-to-br from-orange-400 to-orange-500',
            iconBg: 'bg-white/20'
        },
        {
            title: 'Dépenses',
            value: stats.totalExpenses,
            icon: TrendingDown,
            bgColor: 'bg-gradient-to-br from-blue-700 to-blue-800',
            iconBg: 'bg-white/20'
        },
        {
            title: 'Transactions',
            value: stats.totalVisitors,
            icon: Users,
            bgColor: 'bg-gradient-to-br from-slate-800 to-slate-900',
            iconBg: 'bg-white/20'
        }
    ], [stats]);

    const xAxisFormatter = useCallback((str) => {
        if (!str) return '';
        // str is expected to be 'yyyy-MM-dd'
        const parts = str.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`;
        }
        return str;
    }, []);

    const tooltipLabelFormatter = useCallback((label) => {
        if (!label) return '';
        const parts = label.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return label;
    }, []);

    const tooltipFormatter = useCallback((value, name) => [`${value.toLocaleString()} Ar`, name], []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6" >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-gray-500 mt-1">Vue d'ensemble de votre activité</p>
                    </div>

                    {/* Period Filter */}
                    <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod} className="bg-white rounded-xl shadow-sm">
                        <TabsList className="p-1">
                            {periods.map((period) => (
                                <TabsTrigger
                                    key={period.id}
                                    value={period.id}
                                    className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white"
                                >
                                    <Calendar className="w-4 h-4 mr-2" />
                                    {period.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                {/* Custom Date Range Picker */}
                {selectedPeriod === 'custom' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-white rounded-xl shadow-sm p-4"
                    >
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                                    Date de début
                                </label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                                    Date de fin
                                </label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>

                        </div>
                    </motion.div>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpiCards.map((card, index) => (
                        <motion.div
                            key={card.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card className={`${card.bgColor} border-0 text-white overflow-hidden relative`}>
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-white/80 text-sm font-medium mb-2">{card.title}</p>
                                            <p className="text-3xl font-bold mb-1">
                                                {card.value.toLocaleString()} {card.title !== 'Transactions' && 'Ar'}
                                            </p>
                                            <div className="flex items-center gap-1 text-white/90 text-xs mt-2">
                                                <ArrowUpRight className="w-3 h-3" />
                                                <span>Mis à jour à l'instant</span>
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

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Sales vs Expenses Chart */}
                    <Card className="border-0 shadow-lg">
                        <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white">
                            <CardTitle className="text-lg font-semibold text-gray-800">
                                Ventes vs Dépenses
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#6B7280', fontSize: 12 }}
                                            tickFormatter={xAxisFormatter}
                                            dy={10}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            itemStyle={{ color: '#374151' }}
                                            formatter={tooltipFormatter}
                                            labelFormatter={tooltipLabelFormatter}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="profit"
                                            name="Solde Total"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorSales)"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="expenses"
                                            name="Dépenses"
                                            stroke="#ec4899"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorExpenses)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card className="border-0 shadow-lg">
                        <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white">
                            <CardTitle className="text-lg font-semibold text-gray-800">
                                Activité Récente
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                        <TrendingUp className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">Ventes du jour</p>
                                        <p className="text-xs text-gray-500">{stats.totalVisitors} transactions</p>
                                    </div>
                                    <span className="text-sm font-bold text-green-600">
                                        {stats.totalSales.toLocaleString()} Ar
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                        <TrendingDown className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">Dépenses du jour</p>
                                        <p className="text-xs text-gray-500">{filteredData.expenses.length} dépenses</p>
                                    </div>
                                    <span className="text-sm font-bold text-red-600">
                                        {stats.totalExpenses.toLocaleString()} Ar
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div >
    );
}
