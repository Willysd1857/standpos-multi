import React from 'react';
import { Plus, Package, ChefHat } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function ProductTable({ products, onAddToCart }) {
    const { formatCurrency } = useCurrency();

    const getStockBadgeColor = (stock, minStock = 5) => {
        if (stock <= 0) return 'bg-red-500 text-white';
        if (stock <= minStock) return 'bg-orange-500 text-white';
        return 'bg-emerald-500 text-white';
    };

    return (
        <div className="flex flex-col gap-2">
            {products.map((product) => {
                const isOutOfStock = !!product.track_stock && product.stock <= 0;

                return (
                    <div
                        key={product.id}
                        onClick={() => onAddToCart(product, false)}
                        className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 cursor-pointer ${isOutOfStock
                                ? 'bg-gray-50 opacity-60 cursor-not-allowed grayscale'
                                : 'bg-white border border-gray-100/50 hover:shadow-md hover:shadow-blue-500/10 active:scale-[0.99]'
                            }`}
                    >
                        {/* Image */}
                        <div className="w-14 h-14 rounded-xl shrink-0 bg-[#F0F4FF] overflow-hidden flex items-center justify-center">
                            {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xl font-bold text-blue-200">{product.name.charAt(0)}</span>
                            )}
                        </div>

                        {/* Name and Stock */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <h3 className="font-bold text-gray-700 text-[15px] truncate">{product.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                {!!product.track_stock && product.product_type === 'recipe' ? (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm inline-flex items-center gap-1 ${getStockBadgeColor(product.stock, product.min_stock)}`}>
                                        <ChefHat className="w-2.5 h-2.5" /> ~{product.stock ?? 0}
                                    </span>
                                ) : !!product.track_stock ? (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm inline-flex items-center gap-1 ${getStockBadgeColor(product.stock, product.min_stock)}`}>
                                        <Package className="w-2.5 h-2.5" /> {product.stock || 0} {product.unit}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {/* Price and Add Button */}
                        <div className="flex items-center gap-4 shrink-0">
                            <span className="text-[16px] font-black text-blue-600">
                                {formatCurrency(product.price)}
                            </span>

                            {(!product.track_stock || product.stock > 0) && (
                                <div className="w-8 h-8 rounded-full bg-blue-600 shrink-0 text-white flex items-center justify-center shadow-md hover:bg-blue-700">
                                    <Plus className="w-4 h-4" />
                                </div>
                            )}
                            {isOutOfStock && <span className="text-gray-500 font-medium text-sm pr-2">Rupture</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
