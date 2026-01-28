import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, AlertCircle } from 'lucide-react';

export default function UsageForm({ open, onClose, ingredients, onSubmit, isSubmitting }) {
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    const handleAddIngredient = () => {
        setSelectedIngredients([...selectedIngredients, { ingredient_id: '', quantity: '' }]);
    };

    const handleRemoveIngredient = (index) => {
        setSelectedIngredients(selectedIngredients.filter((_, i) => i !== index));
    };

    const handleIngredientChange = (index, field, value) => {
        const updated = [...selectedIngredients];
        updated[index][field] = value;
        setSelectedIngredients(updated);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('🔍 Form submit triggered');
        setError('');

        console.log('📋 Selected ingredients:', selectedIngredients);

        if (selectedIngredients.length === 0) {
            console.warn('⚠️ No ingredients added');
            setError('Ajoutez au moins un ingrédient');
            return;
        }

        const validIngredients = selectedIngredients.filter(i => i.ingredient_id && i.quantity > 0);
        console.log('✅ Valid ingredients:', validIngredients);

        if (validIngredients.length === 0) {
            console.warn('⚠️ No valid ingredients (missing ID or quantity)');
            setError('Tous les ingrédients doivent avoir une quantité valide');
            return;
        }

        const payload = {
            ingredients: validIngredients.map(i => ({
                ingredient_id: i.ingredient_id,
                quantity: parseFloat(i.quantity)
            })),
            notes
        };

        console.log('📤 Submitting payload:', payload);
        onSubmit(payload);
    };

    const handleClose = () => {
        setSelectedIngredients([]);
        setNotes('');
        setError('');
        onClose();
    };

    const getIngredient = (id) => ingredients.find(i => i.id === id);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Enregistrer une utilisation</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <Label className="text-base font-semibold">Ingrédients utilisés</Label>
                            <Button type="button" onClick={handleAddIngredient} size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50">
                                <Plus className="w-4 h-4 mr-1" />
                                Ajouter
                            </Button>
                        </div>

                        {selectedIngredients.length === 0 && (
                            <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <p className="text-gray-500">Aucun ingrédient ajouté</p>
                                <p className="text-sm text-gray-400">Cliquez sur "Ajouter" pour commencer</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            {selectedIngredients.map((item, index) => {
                                const ingredient = getIngredient(item.ingredient_id);
                                return (
                                    <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 space-y-3">
                                                <div>
                                                    <Label className="text-sm">Ingrédient</Label>
                                                    <Select
                                                        value={item.ingredient_id}
                                                        onValueChange={(val) => handleIngredientChange(index, 'ingredient_id', val)}
                                                    >
                                                        <SelectTrigger className="mt-1">
                                                            <SelectValue placeholder="Sélectionner..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {ingredients.map(ing => (
                                                                <SelectItem key={ing.id} value={ing.id}>
                                                                    {ing.name} (Stock: {ing.stock} {ing.unit})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div>
                                                    <Label className="text-sm">Quantité {ingredient && `(${ingredient.unit})`}</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={item.quantity}
                                                        onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                                                        placeholder="0"
                                                        className="mt-1"
                                                    />
                                                    {ingredient && item.quantity && (
                                                        <p className="text-xs text-gray-600 mt-1">
                                                            Nouveau stock: {(ingredient.stock - parseFloat(item.quantity || 0)).toFixed(2)} {ingredient.unit}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveIngredient(index)}
                                                className="text-red-500 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <Label>Notes / Raison</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Préparation plats du jour, Service traiteur..."
                            rows={3}
                            className="mt-1"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                            Annuler
                        </Button>
                        <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
                            {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
