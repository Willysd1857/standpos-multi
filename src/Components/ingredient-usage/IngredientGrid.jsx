import React from 'react';
import { motion } from 'framer-motion';
import { ChefHat, Package, AlertTriangle } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function IngredientGrid({ ingredients, onIngredientClick, isLoading }) {
    const { formatCurrency } = useCurrency();
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (ingredients.length === 0) {
        return (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-500">Aucun ingrédient disponible</p>
                <p className="text-sm text-gray-400 mt-1">Ajoutez des ingrédients depuis la page Stock</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {ingredients.map((ingredient, index) => {
                const isLowStock = ingredient.stock <= (ingredient.min_stock || 0);
                const stockPercentage = ingredient.min_stock > 0
                    ? (ingredient.stock / ingredient.min_stock) * 100
                    : 100;

                return (
                    <motion.button
                        key={ingredient.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => onIngredientClick(ingredient)}
                        className="group relative bg-white rounded-xl border-2 border-gray-100 hover:border-orange-300 hover:shadow-lg transition-all p-4 text-left overflow-hidden"
                    >
                        {/* Low stock badge */}
                        {isLowStock && (
                            <div className="absolute top-2 right-2 z-10">
                                <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg">
                                    <AlertTriangle className="w-3 h-3" />
                                    Faible
                                </div>
                            </div>
                        )}

                        {/* Image or icon */}
                        <div className="w-full aspect-square bg-gradient-to-br from-orange-50 to-red-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                            {ingredient.image_url ? (
                                <img
                                    src={ingredient.image_url}
                                    alt={ingredient.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                            ) : (
                                <ChefHat className="w-10 h-10 text-orange-400 group-hover:scale-110 transition-transform duration-300" />
                            )}

                            {/* Stock indicator overlay */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                                <div
                                    className={`h-full transition-all ${isLowStock ? 'bg-red-500' : 'bg-green-500'
                                        }`}
                                    style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Info */}
                        <h3 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2 group-hover:text-orange-600 transition-colors">
                            {ingredient.name}
                        </h3>

                        <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                                Stock:
                            </p>
                            <span className={`text-sm font-bold ${isLowStock ? 'text-red-600' : 'text-green-600'
                                }`}>
                                {Number(ingredient.stock).toFixed(2)} {ingredient.unit}
                            </span>
                        </div>

                        {/* Price if available */}
                        {ingredient.price && (
                            <p className="text-xs text-gray-400 mt-1">
                                {formatCurrency(ingredient.price)}/{ingredient.unit}
                            </p>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}
