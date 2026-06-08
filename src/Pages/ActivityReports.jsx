import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PeriodicAnalysis from '../Components/reports/PeriodicAnalysis';
import CashflowAnalysis from '../Components/reports/CashflowAnalysis';
import ProfitabilityAnalysis from '../Components/reports/ProfitabilityAnalysis';
import { BarChart3, LineChart, Wallet, PieChart } from 'lucide-react';

export default function ActivityReports() {
    const [activeTab, setActiveTab] = useState("periodic");

    return (
        <div className="p-4 lg:p-8 bg-gray-50/50 min-h-screen">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3 mb-2">
                    <BarChart3 className="w-8 h-8 text-blue-600" />
                    Rapports d'Activité (BI)
                </h1>
                <p className="text-gray-500">Module complet d'analyse Business Intelligence et statistiques avancées.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                    <TabsList className="w-max inline-flex h-12 items-center justify-start rounded-xl bg-gray-100/80 p-1 text-gray-500">
                        <TabsTrigger value="periodic" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm gap-2">
                            <LineChart className="w-4 h-4" />
                            Analyse Périodique
                        </TabsTrigger>
                        <TabsTrigger value="cashflow" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm gap-2">
                            <Wallet className="w-4 h-4" />
                            Flux de Caisse
                        </TabsTrigger>
                        <TabsTrigger value="profitability" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm gap-2">
                            <PieChart className="w-4 h-4" />
                            Rentabilité & Marges
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="periodic" className="mt-0 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <PeriodicAnalysis />
                    </div>
                </TabsContent>
                
                <TabsContent value="cashflow" className="mt-0 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <CashflowAnalysis />
                    </div>
                </TabsContent>

                <TabsContent value="profitability" className="mt-0 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ProfitabilityAnalysis />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
