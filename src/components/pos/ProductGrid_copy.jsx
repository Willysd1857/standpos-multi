import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Package } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function ProductGrid({ products, onAddToCart }) {
  const { formatCurrency } = useCurrency();

  const getStockBadgeColor = (stock, minStock = 5) => {
    if (stock <= 0) return 'bg-red-500 text-white';
    if (stock <= minStock) return 'bg-orange-500 text-white';
    return 'bg-green-500 text-white';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => onAddToCart(product, false)}
          className={`relative p-4 rounded-2xl text-left transition-all duration-200 group cursor-pointer ${(product.track_stock && product.stock <= 0)
            ? 'bg-gray-100 opacity-60 cursor-not-allowed pointer-events-none'
            : 'bg-white hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98]'
            }`}
        >
          {/* Stock badge - Only show if tracking stock */}
          {product.track_stock && (
            <div className={`absolute top-2 right-2 ${getStockBadgeColor(product.stock, product.min_stock)} px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg z-10`}>
              <Package className="w-3 h-3" />
              {product.stock || 0} {product.unit}
            </div>
          )}

          {/* Product image or placeholder */}
          <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-blue-100 to-indigo-50 mb-3 flex items-center justify-center overflow-hidden relative">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <span className="text-4xl font-bold text-blue-600 opacity-40">
                {product.name.charAt(0)}
              </span>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <h3 className="font-semibold text-gray-800 text-sm truncate">
            {product.name}
          </h3>

          <div className="flex items-center justify-between mt-2">
            <span className="text-lg font-bold text-blue-600">
              {formatCurrency(product.price)}
            </span>

            {(product.track_stock ? product.stock > 0 : true) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart(product, true);
                }}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-95"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>

          {product.track_stock && product.stock <= 0 && (
            <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
              <span className="text-gray-500 font-medium">Rupture</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
