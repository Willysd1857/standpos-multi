import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createPageUrl } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, ShoppingCart, Package, Receipt, Settings,
  Menu, X, ChevronRight, LogOut, LayoutDashboard, Wallet, ShoppingBag, FileText,
  Truck, MapPin, ArrowLeftRight, ShieldAlert, BarChart3
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { name: 'POS', icon: ShoppingCart, label: 'Point de Vente' },
  { name: 'Stock', icon: Package, label: 'Stock' },
  { name: 'Purchases', icon: ShoppingBag, label: 'Achats' },
  { name: 'Expenses', icon: Wallet, label: 'Dépenses' },
  { name: 'Transactions', icon: Receipt, label: 'Transactions' },
  { name: 'Suppliers', icon: Truck, label: 'Fournisseurs' },
  { name: 'Locations', icon: MapPin, label: 'Emplacements' },
  { name: 'StockTransfers', icon: ArrowLeftRight, label: 'Transferts' },
  { name: 'Reports', icon: FileText, label: 'Rapports' },
  { name: 'ActivityReports', icon: BarChart3, label: 'Rapport d\'activité' },
  { name: 'Settings', icon: Settings, label: 'Paramètres' },
  { name: 'PackagingHistory', icon: Package, label: 'Historique Emballages' },
  { name: 'WarehousePackaging', icon: Package, label: 'Emballages' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout, user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const filteredNavItems = navItems.filter(item => {
    // Admin sees everything EXCEPT WarehousePackaging
    if (isAdmin()) return item.name !== 'WarehousePackaging';
    
    // Warehouse (stock_manager) only sees specific stock modules
    const allowedForWarehouse = ['Stock', 'Purchases', 'Suppliers', 'StockTransfers', 'WarehousePackaging'];
    return allowedForWarehouse.includes(item.name);
  }).map(item => {
    if (!isAdmin() && item.name === 'Purchases') {
      return { ...item, label: 'Réception' };
    }
    return item;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fix for Electron hit-test bugs (unclickable inputs)
  React.useEffect(() => {
    const forceReflow = () => {
      // Trigger a resize event to force Chromium to recalculate hitboxes
      window.dispatchEvent(new Event('resize'));

      // Force a layout reflow by micro-adjusting zoom
      const currentZoom = document.body.style.zoom || '0.8';
      document.body.style.zoom = '0.799';
      // Triggering offsetHeight to force reflow
      void document.body.offsetHeight;
      document.body.style.zoom = currentZoom;
    };

    const handleFocus = () => {
      // Delay slightly for native windows to finish transitions
      setTimeout(forceReflow, 50);
    };

    window.addEventListener('focus', handleFocus);

    // Also force reflow on pointer down for inputs
    const handlePointerDown = (e) => {
      const isInput = e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.closest('button') ||
        e.target.getAttribute('role') === 'button';

      if (isInput) {
        // Use a very fast toggle to not interfere with the click itself
        forceReflow();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);


  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-100 z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/standpos-logo.png" alt="StandPOS Logo" className="w-12 h-12 rounded-xl shadow-lg shadow-blue-500/30 object-contain" />
          <span className="font-bold text-gray-800">StandPOS</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
      </header>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed right-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col max-h-screen"
            >
              <div className="p-4 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img src="/standpos-logo.png" alt="StandPOS Logo" className="w-12 h-12 rounded-xl object-contain" />
                  <span className="font-bold text-gray-800">StandPOS</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-xl hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {filteredNavItems.map((item) => (
                  <Link
                    key={item.name}
                    to={createPageUrl(item.name)}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPageName === item.name
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                    <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
                  </Link>
                ))}
              </nav>

              <div className="p-4 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-100"
                >
                  <LogOut className="w-5 h-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-bold text-sm">Déconnexion</span>
                    <span className="text-[10px] opacity-80">{user?.username || 'Utilisateur'}</span>
                  </div>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-none shadow-[2px_0_15px_-3px_rgba(0,0,0,0.07)] flex-col z-30 max-h-screen">
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ rotate: -10 }}
              animate={{ rotate: 0 }}
            >
              <img src="/standpos-logo.png" alt="StandPOS Logo" className="w-14 h-14 rounded-xl shadow-lg shadow-blue-500/30 object-contain" />
            </motion.div>
            <div>
              <h1 className="font-bold text-gray-800">StandPOS</h1>
              <p className="text-xs text-gray-500">La caisse qui vous met debout</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {filteredNavItems.map((item) => (
            <Link
              key={item.name}
              to={createPageUrl(item.name)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPageName === item.name
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-100 shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            <div className="flex flex-col items-start">
              <span className="font-bold text-sm">Déconnexion</span>
              <span className="text-[10px] opacity-80">{user?.username || 'Utilisateur'}</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
