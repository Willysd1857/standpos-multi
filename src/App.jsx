import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import { PageLoader } from "./components/PageLoader";

import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Lazy load pages
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const POS = lazy(() => import('./Pages/POS'));
const Stock = lazy(() => import('./Pages/Stock'));
const Transactions = lazy(() => import('./Pages/Transactions'));
const Settings = lazy(() => import('./Pages/Settings'));
const Expenses = lazy(() => import('./Pages/Expenses'));
const Purchases = lazy(() => import('./Pages/Purchases'));
const Reports = lazy(() => import('./Pages/Reports'));
const ActivityReports = lazy(() => import('./Pages/ActivityReports'));
const Login = lazy(() => import('./Pages/Login'));
const Suppliers = lazy(() => import('./Pages/Suppliers'));
const Locations = lazy(() => import('./Pages/Locations'));
const StockTransfers = lazy(() => import('./Pages/StockTransfers'));
const PackagingHistory = lazy(() => import('./Pages/PackagingHistory'));
const WarehousePackaging = lazy(() => import('./Pages/WarehousePackaging'));

// Protected Route Component
const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { isAuthenticated, loading, isAdmin } = useAuth();

    if (loading) {
        return <PageLoader />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requireAdmin && !isAdmin()) {
        return <Navigate to="/stock" replace />;
    }

    return children;
};

function AppRoutes() {
    const { isAuthenticated, loading, isAdmin } = useAuth();
    if (loading) {
        return <PageLoader />;
    }

    return (
        <Routes>
            {/* Public route */}
            <Route path="/login" element={
                isAuthenticated ? (isAdmin() ? <Navigate to="/dashboard" replace /> : <Navigate to="/stock" replace />) : <Login />
            } />

            {/* Protected routes */}
            <Route path="/" element={
                <ProtectedRoute>
                    {isAdmin() ? <Navigate to="/dashboard" replace /> : <Navigate to="/stock" replace />}
                </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Dashboard">
                        <Dashboard />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/pos" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="POS">
                        <POS />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/stock" element={
                <ProtectedRoute>
                    <Layout currentPageName="Stock">
                        <Stock />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/transactions" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Transactions">
                        <Transactions />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/settings" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Settings">
                        <Settings />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/expenses" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Expenses">
                        <Expenses />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/purchases" element={
                <ProtectedRoute>
                    <Layout currentPageName="Purchases">
                        <Purchases />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/reports" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Reports">
                        <Reports />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/activity-reports" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="ActivityReports">
                        <ActivityReports />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/suppliers" element={
                <ProtectedRoute>
                    <Layout currentPageName="Suppliers">
                        <Suppliers />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/locations" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="Locations">
                        <Locations />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/stock-transfers" element={
                <ProtectedRoute>
                    <Layout currentPageName="StockTransfers">
                        <StockTransfers />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/packaging-history" element={
                <ProtectedRoute requireAdmin={true}>
                    <Layout currentPageName="PackagingHistory">
                        <PackagingHistory />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/warehouse-packaging" element={
                <ProtectedRoute>
                    <Layout currentPageName="WarehousePackaging">
                        <WarehousePackaging />
                    </Layout>
                </ProtectedRoute>
            } />
        </Routes>
    );
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <Toaster position="top-center" richColors />
                <Router>
                    <Suspense fallback={<PageLoader />}>
                        <AppRoutes />
                    </Suspense>
                </Router>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
