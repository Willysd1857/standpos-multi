import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, Save, Trash2, Coffee, Pizza, Sandwich, GlassWater, IceCream, UtensilsCrossed } from 'lucide-react';

const iconOptions = [
  { id: 'coffee', label: 'Café', icon: Coffee },
  { id: 'pizza', label: 'Pizza', icon: Pizza },
  { id: 'sandwich', label: 'Sandwich', icon: Sandwich },
  { id: 'drink', label: 'Boisson', icon: GlassWater },
  { id: 'dessert', label: 'Dessert', icon: IceCream },
  { id: 'default', label: 'Général', icon: UtensilsCrossed },
];

export default function CategoryForm({ open, onClose, category, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    icon: 'default',
    color: '#2563eb',
    order: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        icon: category.icon || 'default',
        color: category.color || '#2563eb',
        order: category.order || 0
      });
    } else {
      setFormData({
        name: '',
        icon: 'default',
        color: '#2563eb',
        order: 0
      });
    }
  }, [category, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    await onSave(formData);
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette catégorie ?')) {
      setIsProcessing(true);
      try {
        await onDelete(category.id);
        onClose();
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        alert('Erreur lors de la suppression. Veuillez réessayer.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <Label>Nom de la catégorie *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Boissons"
              required
              className="rounded-xl mt-1"
            />
          </div>

          <div>
            <Label>Icône</Label>
            <Select
              value={formData.icon}
              onValueChange={(value) => setFormData({ ...formData, icon: value })}
            >
              <SelectTrigger className="rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Ordre d'affichage</Label>
            <Input
              type="number"
              value={formData.order}
              onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
              placeholder="0"
              className="rounded-xl mt-1"
            />
          </div>

          <div className="flex gap-3 pt-4">
            {category && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={isProcessing}
                className="text-red-500 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl"
              disabled={isProcessing}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isProcessing || !formData.name}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl"
            >
              <Save className="w-4 h-4 mr-2" />
              {isProcessing ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}