import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Package, ChefHat } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function ProductGrid({ products, onAddToCart }) {
  const { formatCurrency } = useCurrency();

  const getStockBadgeColor = (stock, minStock = 5) => {
    if (stock <= 0) return 'bg-red-500 text-white';
    if (stock <= minStock) return 'bg-orange-500 text-white';
    return 'bg-emerald-500 text-white';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => onAddToCart(product, false)}
          className={`relative flex flex-col rounded-2xl text-left transition-all duration-300 group cursor-pointer p-4 ${(!!product.track_stock && product.stock <= 0)
            ? 'bg-gray-50 opacity-60 cursor-not-allowed grayscale'
            : 'bg-white border border-gray-100/50 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 active:scale-[0.98]'
            }`}
        >
          {/* Stock badge — recipe products show estimated portions */}
          {!!product.track_stock && product.product_type === 'recipe' ? (
            <div className={`absolute top-2 right-2 ${getStockBadgeColor(product.stock, product.min_stock)} px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm z-20 border border-white/20`}>
              <ChefHat className="w-2.5 h-2.5" />
              ~{product.stock ?? 0}
            </div>
          ) : !!product.track_stock ? (
            <div className={`absolute top-2 right-2 ${getStockBadgeColor(product.stock, product.min_stock)} px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm z-20 border border-white/20`}>
              <Package className="w-2.5 h-2.5" />
              {product.stock || 0} {product.unit}
            </div>
          ) : null}

          {/* Product image or placeholder */}
          <div className="w-full aspect-square rounded-xl bg-[#F0F4FF] flex items-center justify-center overflow-hidden relative shadow-inner mb-3">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <span className="text-4xl font-bold text-blue-200">
                {product.name.charAt(0)}
              </span>
            )}
            <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex-1 flex flex-col justify-between">
            <h3 className="font-bold text-gray-700 text-sm line-clamp-1 leading-snug group-hover:text-blue-600 transition-colors">
              {product.name}
            </h3>

<div className="flex items-center justify-between mt-1">
              <span className="text-[15px] font-black text-blue-600">
                {formatCurrency(product.price)}
              </span>

              {(!product.track_stock || product.stock > 0) && (
                <div
                  className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-lg hover:bg-blue-700 active:scale-90"
                >
                  <Plus className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {!!product.track_stock && product.stock <= 0 && (
            <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
              <span className="text-gray-500 font-medium">Rupture</span>
            </div>
          )}
        </div>
      ))
      }
    </div >
  );
}
