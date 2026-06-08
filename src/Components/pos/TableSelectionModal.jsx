import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Utensils, X, Check, ShoppingBag, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function TableSelectionModal({ open, onConfirm, onCancel }) {
    const [tableNumber, setTableNumber] = useState('');
    const [isVip, setIsVip] = useState(false);

    const toggleVip = () => {
        const nextVip = !isVip;
        setIsVip(nextVip);
        if (nextVip && !tableNumber.trim()) {
            setTableNumber('VIP');
        }
    };

    const handleTableChange = (val) => {
        setTableNumber(val);
        if (val.toUpperCase().includes('VIP')) {
            setIsVip(true);
        }
    };

    const handleSubmit = (e, directTable = null) => {
        if (e) e.preventDefault();

        const finalTable = directTable || tableNumber.trim();
        if (finalTable) {
            onConfirm(finalTable.toUpperCase(), isVip);
            // Reset form
            setTableNumber('');
            setIsVip(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onCancel}>
            <DialogContent className="sm:max-w-[400px] bg-white rounded-3xl p-6 shadow-2xl border-0">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black text-gray-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center">
                            <Utensils className="w-6 h-6 text-blue-600" />
                        </div>
                        Nouvelle Table
                    </DialogTitle>
                </DialogHeader>

                {/* Direct Sale Button */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => handleSubmit(null, 'VD')}
                    className="w-full h-16 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-lg shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 transition-all flex items-center justify-center gap-3 mt-4"
                >
                    <ShoppingBag className="w-6 h-6" />
                    Vente Directe (VD)
                </motion.button>

                {/* VIP Toggle */}
                <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isVip ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'bg-amber-100 text-amber-600'}`}>
                            <Star className={`w-6 h-6 ${isVip ? 'fill-current' : ''}`} />
                        </div>
                        <div className="cursor-pointer" onClick={toggleVip}>
                            <p className="font-bold text-amber-900 text-sm">Table VIP</p>
                            <p className="text-amber-700 text-[10px]">Appliquer les frais VIP</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={toggleVip}
                        className={cn(
                            "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                            isVip ? "bg-amber-600" : "bg-gray-300"
                        )}
                    >
                        <span className={cn(
                            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                            isVip ? "translate-x-5" : "translate-x-0"
                        )} />
                    </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs font-bold text-gray-400 uppercase">ou</span>
                    <div className="flex-1 h-px bg-gray-200" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-500 ml-1">Numéro de table</label>
                        <Input
                            autoFocus
                            value={tableNumber}
                            onChange={(e) => handleTableChange(e.target.value)}
                            placeholder="Ex: T5, Salon 1..."
                            className="h-16 text-2xl font-bold rounded-2xl border-2 border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-center uppercase"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            className="h-14 rounded-2xl border-2 hover:bg-gray-50 font-bold text-gray-600"
                        >
                            <X className="w-5 h-5 mr-2" />
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            disabled={!tableNumber.trim()}
                            className="h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all disabled:opacity-50"
                        >
                            <Check className="w-5 h-5 mr-2" />
                            Commencer
                        </Button>
                    </div>
                </form>

                {/* Quick Tables */}
                <div className="mt-6">
                    <p className="text-xs font-bold text-gray-400 mb-3 ml-1 uppercase">Tables rapides</p>
                    <div className="grid grid-cols-4 gap-2">
                        {['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'].map((t) => (
                            <motion.button
                                key={t}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                type="button"
                                onClick={() => handleSubmit(null, t)}
                                className="h-12 rounded-xl bg-gray-50 border border-gray-100 text-gray-700 font-bold hover:bg-blue-50 hover:border-blue-200 transition-colors"
                            >
                                {t}
                            </motion.button>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
