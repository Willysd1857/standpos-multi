import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Utensils, ShoppingBag, Crown } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function OrderBubbles({ orders, activeOrderId, vipCharge = 0, onSelect, onNewOrder }) {
    const { formatCurrency } = useCurrency();
    return (
        <div className="flex items-center gap-3 p-3 bg-white/50 backdrop-blur-md border-y border-gray-200 overflow-x-auto no-scrollbar">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onNewOrder}
                className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all"
            >
                <Plus className="w-6 h-6" />
            </motion.button>

            <div className="h-8 w-px bg-gray-300 mx-1 flex-shrink-0" />

            <AnimatePresence mode="popLayout">
                {orders.map((order) => {
                    const subtotal = Array.isArray(order.items)
                        ? order.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
                        : 0;

                    const total = subtotal + (order.is_vip ? vipCharge : 0);

                    const isDirect = !order.table_number || order.table_number === 'VD';

                    return (
                        <motion.button
                            key={order.id}
                            layout
                            initial={{ scale: 0, opacity: 0, x: -20 }}
                            animate={{ scale: 1, opacity: 1, x: 0 }}
                            exit={{ scale: 0, opacity: 0, x: 20 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onSelect(order.id)}
                            className={`flex-shrink-0 min-w-[6rem] h-12 px-4 rounded-2xl flex items-center gap-3 transition-all shadow-md ${activeOrderId === order.id
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white border-2 border-white/20'
                                : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-inner ${activeOrderId === order.id ? 'bg-white/20' : order.is_vip ? 'bg-amber-50' : !isDirect ? 'bg-blue-50' : 'bg-green-50'
                                }`}>
                                {order.is_vip ? (
                                    <Crown className={`w-4 h-4 ${activeOrderId === order.id ? 'text-white' : 'text-amber-600'}`} />
                                ) : !isDirect ? (
                                    <Utensils className={`w-4 h-4 ${activeOrderId === order.id ? 'text-white' : 'text-blue-600'}`} />
                                ) : (
                                    <ShoppingBag className={`w-4 h-4 ${activeOrderId === order.id ? 'text-white' : 'text-green-600'}`} />
                                )}
                            </div>
                            <div className="flex flex-col items-start leading-tight">
                                <span className="font-black text-sm uppercase tracking-tight">
                                    {order.table_number || 'Direct'}
                                </span>
                                <span className={`text-[10px] font-bold ${activeOrderId === order.id ? 'text-blue-100' : 'text-blue-600'
                                    }`}>
                                    {formatCurrency(total)}
                                </span>
                            </div>
                        </motion.button>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
