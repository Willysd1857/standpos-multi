import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import { PageLoader } from './components/PageLoader';

// Lazy load pages
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const POS = lazy(() => import('./Pages/POS'));
const Stock = lazy(() => import('./Pages/Stock'));
const Transactions = lazy(() => import('./Pages/Transactions'));
const Settings = lazy(() => import('./Pages/Settings'));
const Expenses = lazy(() => import('./Pages/Expenses'));
const Purchases = lazy(() => import('./Pages/Purchases'));
const IngredientUsage = lazy(() => import('./Pages/IngredientUsage'));

function App() {
    return (
        <Router>
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    <Route path="/dashboard" element={
                        <Layout currentPageName="Dashboard">
                            <Dashboard />
                        </Layout>
                    } />

                    <Route path="/pos" element={
                        <Layout currentPageName="POS">
                            <POS />
                        </Layout>
                    } />

                    <Route path="/stock" element={
                        <Layout currentPageName="Stock">
                            <Stock />
                        </Layout>
                    } />

                    <Route path="/transactions" element={
                        <Layout currentPageName="Transactions">
                            <Transactions />
                        </Layout>
                    } />

                    <Route path="/settings" element={
                        <Layout currentPageName="Settings">
                            <Settings />
                        </Layout>
                    } />

                    <Route path="/expenses" element={
                        <Layout currentPageName="Expenses">
                            <Expenses />
                        </Layout>
                    } />

                    <Route path="/purchases" element={
                        <Layout currentPageName="Purchases">
                            <Purchases />
                        </Layout>
                    } />

                    <Route path="/ingredientusage" element={
                        <Layout currentPageName="IngredientUsage">
                            <IngredientUsage />
                        </Layout>
                    } />
                </Routes>
            </Suspense>
        </Router>
    );
}

export default App;
