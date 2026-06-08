import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChefHat, Plus, Minus, X, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QuickAddCard = forwardRef(({ ingredients, onSubmit, isSubmitting }, ref) => {
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [notes, setNotes] = useState('');
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState(null);


    const handleAddIngredient = (ingredient) => {
        const existing = selectedIngredients.find(i => i.id === ingredient.id);
        if (existing) {
            // Increase quantity
            setSelectedIngredients(prev =>
                prev.map(i => i.id === ingredient.id ? { ...i, quantity: Number(i.quantity) + 1 } : i)
            );
        } else {
            // Add new
            setSelectedIngredients(prev => [
                ...prev,
                { ...ingredient, quantity: 1 }
            ]);
        }
    };

    const handleClearSelection = () => {
        setIsClearConfirmOpen(true);
    };

    const confirmClear = () => {
        setSelectedIngredients([]);
        setIsClearConfirmOpen(false);
    };

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        addIngredient: handleAddIngredient
    }));


    const handleUpdateQuantity = (id, val) => {
        // Replace comma with dot for French input style
        const normalizedVal = typeof val === 'string' ? val.replace(',', '.') : val;

        // If it's a number from the Plus/Minus buttons or a string from the Input
        const newQuantity = typeof normalizedVal === 'string' ? normalizedVal : Number(normalizedVal);

        // Allow typing "0." or empty string
        if (newQuantity === '' || newQuantity === '.' || newQuantity === '0.') {
            setSelectedIngredients(prev =>
                prev.map(i => i.id === id ? { ...i, quantity: newQuantity } : i)
            );
            return;
        }

        const numValue = Number(newQuantity);
        if (numValue < 0) return;

        setSelectedIngredients(prev =>
            prev.map(i => i.id === id ? { ...i, quantity: newQuantity } : i)
        );
    };

    const handleRemoveIngredient = (id) => {
        setSelectedIngredients(prev => prev.filter(i => i.id !== id));
    };

    const handleSubmit = async () => {
        if (selectedIngredients.length === 0) {
            setAlertMessage("Veuillez sélectionner au moins un ingrédient");
            return;
        }

        // Validate that all quantities are valid positive numbers
        const invalid = selectedIngredients.find(ing => Number(ing.quantity) <= 0 || isNaN(Number(ing.quantity)));
        if (invalid) {
            setAlertMessage(`Quantité invalide pour ${invalid.name}`);
            return;
        }

        const data = {
            ingredients: selectedIngredients.map(ing => ({
                ingredient_id: ing.id,
                quantity: Number(ing.quantity)
            })),
            notes: notes.trim() || undefined
        };

        await onSubmit(data);

        // Reset form
        setSelectedIngredients([]);
        setNotes('');
    };

    const totalItems = selectedIngredients.reduce((sum, ing) => sum + ing.quantity, 0);

    return (
        <Card className="border-0 shadow-lg h-full flex flex-col">
            <CardHeader className="bg-gradient-to-br from-orange-50 to-red-50 border-b shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ChefHat className="w-5 h-5 text-orange-600" />
                        Nouvelle Utilisation
                    </CardTitle>
                    {selectedIngredients.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearSelection}
                            className="h-8 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg gap-1"
                        >
                            <Trash2 className="w-3 h-3" />
                            Tout vider
                        </Button>
                    )}
                </div>
                {selectedIngredients.length > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                        {selectedIngredients.length} ingrédient{selectedIngredients.length > 1 ? 's' : ''} · {Number(totalItems).toFixed(2)} unité{totalItems > 1 ? 's' : ''}
                    </p>
                )}
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Selected Ingredients */}
                {selectedIngredients.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Cliquez sur un ingrédient ci-dessous pour l'ajouter</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ingrédients sélectionnés</h4>
                        <AnimatePresence>
                            {selectedIngredients.map((ing) => (
                                <motion.div
                                    key={ing.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="bg-white border border-gray-200 rounded-xl p-3 space-y-2"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900 text-sm">{ing.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Stock disponible: {Number(ing.stock).toFixed(2)} {ing.unit}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveIngredient(ing.id)}
                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => handleUpdateQuantity(ing.id, Number(ing.quantity) - 1)}
                                            className="h-8 w-8 rounded-lg"
                                        >
                                            <Minus className="w-3 h-3" />
                                        </Button>
                                        <Input
                                            type="number"
                                            value={ing.quantity}
                                            onChange={(e) => handleUpdateQuantity(ing.id, e.target.value)}
                                            className="h-8 text-center font-semibold"
                                            min="0"
                                            step="0.01"
                                            max={ing.stock}
                                        />
                                        <span className="text-sm text-gray-600 min-w-[3rem]">{ing.unit}</span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => handleUpdateQuantity(ing.id, Number(ing.quantity) + 1)}
                                            disabled={Number(ing.quantity) >= ing.stock}
                                            className="h-8 w-8 rounded-lg"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                        Notes / Observations (optionnel)
                    </label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ex: Préparation du plat du jour..."
                        className="rounded-xl resize-none"
                        rows={3}
                    />
                </div>
            </CardContent>

            {/* Footer with submit button */}
            <div className="p-4 border-t bg-gray-50 shrink-0">
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || selectedIngredients.length === 0}
                    className="w-full bg-orange-600 hover:bg-orange-700 rounded-xl h-11"
                >
                    {isSubmitting ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Enregistrement...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Enregistrer l'utilisation
                        </>
                    )}
                </Button>
            </div>

            {/* Dialogs */}
            <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Vider la sélection ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tous les ingrédients sélectionnés seront retirés du panier actuel.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmClear} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
                            Vider
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!alertMessage} onOpenChange={(open) => !open && setAlertMessage(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Attention</AlertDialogTitle>
                        <AlertDialogDescription>
                            {alertMessage}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl">OK</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
});

QuickAddCard.displayName = 'QuickAddCard';

export default QuickAddCard;
