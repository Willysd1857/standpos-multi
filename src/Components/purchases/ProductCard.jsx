import React from 'react';
import { motion } from 'framer-motion';
import { Package, AlertCircle } from 'lucide-react';

export default function ProductCard({ product, onClick }) {
    const stockPercentage = product.min_stock > 0
        ? (product.stock / product.min_stock) * 100
        : 100;

    const getStockStatus = () => {
        if (product.stock === 0) return { label: 'Rupture', color: 'bg-red-500', textColor: 'text-red-600' };
        if (product.stock < product.min_stock) return { label: 'Stock faible', color: 'bg-orange-500', textColor: 'text-orange-600' };
        return { label: 'En stock', color: 'bg-green-500', textColor: 'text-green-600' };
    };

    const status = getStockStatus();

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onClick(product)}
            className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden border-2 border-gray-100 hover:border-green-400"
        >
            {/* Image */}
            <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ display: product.image_url ? 'none' : 'flex' }}
                >
                    <Package className="w-16 h-16 text-gray-300" />
                </div>

                {/* Stock badge */}
                <div className="absolute top-2 right-2">
                    <div className={`${status.color} text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1`}>
                        {product.stock === 0 && <AlertCircle className="w-3 h-3" />}
                        {product.stock}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="p-4">
                <h3 className="font-bold text-gray-800 mb-1 line-clamp-2 min-h-[2.5rem]">
                    {product.name}
                </h3>

                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Stock actuel</span>
                    <span className={`text-sm font-semibold ${status.textColor}`}>
                        {product.stock} / {product.min_stock}
                    </span>
                </div>

                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Prix vente</span>
                    <span className="text-lg font-bold text-green-600">
                        {product.price?.toLocaleString()} Ar
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Prix d'achat</span>
                    <span className="text-sm font-semibold text-blue-600">
                        {product.cost_price?.toLocaleString() || '—'} Ar
                    </span>
                </div>

                {/* Stock status bar */}
                <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        className={`h-full ${status.color}`}
                    />
                </div>

                <p className={`text-xs font-medium mt-1 ${status.textColor}`}>
                    {status.label}
                </p>
            </div>
        </motion.div>
    );
}
