import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, Save, Trash2, GlassWater, Utensils, ShoppingBasket, Store, Tag, Shirt, Pill, Wrench, Bike, Smartphone, LayoutGrid, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const iconOptions = [
  { id: 'default', label: 'Général', icon: LayoutGrid },
  { id: 'basket', label: 'Panier', icon: ShoppingBasket },
  { id: 'store', label: 'Magasin', icon: Store },
  { id: 'tag', label: 'Prix/Étiquette', icon: Tag },
  { id: 'shirt', label: 'Vêtements', icon: Shirt },
  { id: 'pill', label: 'Pharmacie', icon: Pill },
  { id: 'wrench', label: 'Outils/Pièces', icon: Wrench },
  { id: 'bike', label: 'Moto/Velo', icon: Bike },
  { id: 'phone', label: 'Électronique', icon: Smartphone },
  { id: 'utensils', label: 'Restaurant', icon: Utensils },
  { id: 'drink', label: 'Boisson', icon: GlassWater },
];

export default function CategoryForm({ open, onClose, category, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    icon: 'default',
    color: '#2563eb',
    order: 0,
    hidden_in_pos: false
  });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (category) {
      // Vérifier si l'icône existe toujours dans les options
      const iconExists = iconOptions.some(opt => opt.id === category.icon);
      setFormData({
        name: category.name || '',
        icon: iconExists ? (category.icon || 'default') : 'default',
        color: category.color || '#2563eb',
        order: category.order || 0,
        hidden_in_pos: !!category.hidden_in_pos
      });
    } else {
      setFormData({
        name: '',
        icon: 'default',
        color: '#2563eb',
        order: 0,
        hidden_in_pos: false
      });
    }
  }, [category, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Le nom de la catégorie est requis');
      return;
    }

    setIsProcessing(true);
    try {
      // S'assurer qu'une icône est toujours définie
      const cleanData = {
        ...formData,
        icon: formData.icon || 'default'
      };

      await onSave(cleanData);
      // Le form se fermera via le parent sur onSuccess
    } catch (error) {
      console.error('Error saving category:', error);
      const errorMsg = error.message || 'Erreur inconnue';
      toast.error(`Erreur lors de l'enregistrement : ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    toast('Êtes-vous sûr de vouloir supprimer cette catégorie ?', {
      action: {
        label: 'Supprimer',
        onClick: async () => {
          setIsProcessing(true);
          try {
            await onDelete(category.id);
            onClose();
            toast.success('Catégorie supprimée');
          } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            toast.error('Erreur lors de la suppression. Veuillez réessayer.');
          } finally {
            setIsProcessing(false);
          }
        }
      }
    });
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
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => {
                  const menu = document.getElementById('icon-menu-' + (category?.id || 'new'));
                  if (menu) {
                    menu.classList.toggle('hidden');
                  }
                }}
                className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-xl border border-input bg-white px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <div className="flex items-center gap-2">
                  {(() => {
                    const selectedOption = iconOptions.find(opt => opt.id === formData.icon);
                    if (selectedOption) {
                      const IconComponent = selectedOption.icon;
                      return (
                        <>
                          <IconComponent className="w-4 h-4 shrink-0" />
                          <span className="text-sm">{selectedOption.label}</span>
                        </>
                      );
                    }
                    return <span className="text-sm text-gray-400">Sélectionner une icône</span>;
                  })()}
                </div>
                <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                id={'icon-menu-' + (category?.id || 'new')}
                className="hidden absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md"
              >
                <div className="p-1">
                  {iconOptions.map((opt) => {
                    const IconComponent = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, icon: opt.id });
                          const menu = document.getElementById('icon-menu-' + (category?.id || 'new'));
                          if (menu) menu.classList.add('hidden');
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-blue-50 hover:text-blue-900 ${formData.icon === opt.id ? 'bg-blue-50 text-blue-900' : ''
                          }`}
                      >
                        <IconComponent className="w-4 h-4" />
                        {opt.label}
                        {formData.icon === opt.id && (
                          <svg className="ml-auto h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
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

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-700">Masquer dans le POS</p>
                <p className="text-xs text-gray-500">Cette catégorie ne sera pas visible en caisse</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, hidden_in_pos: !formData.hidden_in_pos })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.hidden_in_pos ? 'bg-orange-500' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formData.hidden_in_pos ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
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