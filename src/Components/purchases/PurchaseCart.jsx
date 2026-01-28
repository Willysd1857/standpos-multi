import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PurchaseCart({ items, onUpdateItem, onRemoveItem, onCheckout, onClear }) {
    const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    return (
        <div className="h-full flex flex-col bg-white rounded-2xl shadow-lg border border-gray-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-green-600" />
                        <h3 className="font-bold text-gray-800">Panier</h3>
                    </div>
                    <span className="text-sm font-semibold text-gray-500">
                        {items.length} produit{items.length > 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AnimatePresence>
                    {items.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center h-full text-gray-400 py-12"
                        >
                            <ShoppingCart className="w-16 h-16 mb-3" />
                            <p className="text-sm">Panier vide</p>
                            <p className="text-xs">Cliquez sur un produit pour l'ajouter</p>
                        </motion.div>
                    ) : (
                        items.map((item) => (
                            <motion.div
                                key={item.product_id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="bg-gray-50 rounded-xl p-3 border border-gray-200"
                            >
                                {/* Product name */}
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-semibold text-gray-900 text-sm flex-1">
                                        {item.product_name}
                                    </h4>
                                    <button
                                        onClick={() => onRemoveItem(item.product_id)}
                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Quantity controls */}
                                <div className="flex items-center gap-2 mb-2">
                                    <button
                                        onClick={() => onUpdateItem(item.product_id, { quantity: Math.max(0, item.quantity - 1) })}
                                        className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                                    >
                                        <Minus className="w-3 h-3" />
                                    </button>
                                    <Input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => onUpdateItem(item.product_id, { quantity: Number(e.target.value) || 0 })}
                                        className="w-16 h-7 text-center text-sm font-semibold"
                                        min="0"
                                    />
                                    <button
                                        onClick={() => onUpdateItem(item.product_id, { quantity: item.quantity + 1 })}
                                        className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                    <span className="text-xs text-gray-500">x</span>
                                    <Input
                                        type="number"
                                        value={item.unit_price}
                                        onChange={(e) => onUpdateItem(item.product_id, { unit_price: Number(e.target.value) || 0 })}
                                        className="flex-1 h-7 text-sm font-semibold"
                                        placeholder="Prix"
                                        min="0"
                                    />
                                    <span className="text-xs text-gray-500">Ar</span>
                                </div>

                                {/* Total */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Total</span>
                                    <span className="font-bold text-green-600">
                                        {(item.quantity * item.unit_price).toLocaleString()} Ar
                                    </span>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            {items.length > 0 && (
                <div className="p-4 border-t border-gray-200 space-y-3">
                    {/* Total */}
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700">TOTAL</span>
                        <span className="text-2xl font-bold text-green-600">
                            {total.toLocaleString()} Ar
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                        <Button
                            onClick={onCheckout}
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl shadow-lg"
                        >
                            Finaliser l'approvisionnement
                        </Button>
                        <Button
                            onClick={onClear}
                            variant="outline"
                            className="w-full rounded-xl"
                        >
                            Vider le panier
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
