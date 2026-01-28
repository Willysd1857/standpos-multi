import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Package, Save, Trash2, Upload, X, ChefHat } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const UNITS = ['kg', 'L', 'pièces', 'g', 'mL', 'sachets'];

export default function ProductForm({ open, onClose, product, categories, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    cost_price: '',
    stock: '',
    min_stock: '',
    image_url: '',
    is_active: true,
    is_ingredient: false,
    unit: 'kg'
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        category_id: product.category_id || '',
        price: product.price?.toString() || '',
        cost_price: product.cost_price?.toString() || '',
        stock: product.stock?.toString() || '',
        min_stock: product.min_stock?.toString() || '',
        image_url: product.image_url || '',
        is_active: product.is_active !== false,
        is_ingredient: !!product.is_ingredient,
        unit: product.unit || 'kg'
      });
    } else {
      setFormData({
        name: '',
        category_id: '',
        price: '',
        cost_price: '',
        stock: '',
        min_stock: '',
        image_url: '',
        is_active: true,
        is_ingredient: false,
        unit: 'kg'
      });
    }
  }, [product, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      await onSave({
        ...formData,
        price: Number(formData.price) || 0,
        cost_price: Number(formData.cost_price) || 0,
        stock: Number(formData.stock) || 0,
        min_stock: Number(formData.min_stock) || 5
      });
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      alert(`Erreur lors de l'enregistrement du produit: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      setIsProcessing(true);
      await onDelete(product.id);
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, image_url: result.file_url });
    } catch (error) {
      console.error('Erreur upload:', error);
    }
    setUploadingImage(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {formData.is_ingredient ? (
              <ChefHat className="w-5 h-5 text-orange-600" />
            ) : (
              <Package className="w-5 h-5 text-blue-600" />
            )}
            {product ? 'Modifier' : 'Nouveau'} {formData.is_ingredient ? 'ingrédient' : 'produit'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Toggle ingrédient EN HAUT */}
          <div className="flex items-center justify-between bg-orange-50 rounded-xl p-4 border-2 border-orange-300 shadow-sm">
            <div className="flex-1 space-y-1 pr-4">
              <Label className="cursor-pointer font-bold text-orange-900 flex items-center gap-2 text-base">
                <ChefHat className="w-5 h-5" />
                Est un ingrédient ?
              </Label>
              <p className="text-xs text-orange-700 leading-relaxed">
                {formData.is_ingredient
                  ? "✓ Cet ingrédient n'apparaîtra pas dans le POS"
                  : "Ce produit sera disponible à la vente"}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={formData.is_ingredient}
                onCheckedChange={(checked) => setFormData({ ...formData, is_ingredient: checked })}
                className="data-[state=checked]:bg-orange-600"
              />
            </div>
          </div>

          {/* Nom */}
          <div>
            <Label>{formData.is_ingredient ? 'Nom de l\'ingrédient' : 'Nom du produit'} *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={formData.is_ingredient ? "Ex: Huile de tournesol" : "Ex: Coca-Cola 33cl"}
              required
              className="rounded-xl mt-1"
            />
          </div>

          {/* Catégorie */}
          <div>
            <Label>Catégorie *</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger className="rounded-xl mt-1">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CHAMPS DIFFÉRENTS selon is_ingredient */}
          {formData.is_ingredient ? (
            // INGRÉDIENT
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unité de mesure *</Label>
                  <Select
                    value={formData.unit}
                    onValueChange={(value) => setFormData({ ...formData, unit: value })}
                  >
                    <SelectTrigger className="rounded-xl mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Coût unitaire (Ar) *</Label>
                  <Input
                    type="number"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0"
                    required
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stock initial</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label>Stock minimum</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="5"
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>

              {/* Photo pour ingrédients */}
              <div>
                <Label>Photo de l'ingrédient</Label>
                <div className="mt-2 space-y-3">
                  {formData.image_url && (
                    <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-100">
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image_url: '' })}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl hover:border-orange-600 hover:bg-orange-50 transition-colors">
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {uploadingImage ? 'Upload en cours...' : 'Télécharger une photo'}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="Ou entrez l'URL de l'image..."
                    className="rounded-xl"
                  />
                </div>
              </div>
            </>
          ) : (
            // PRODUIT FINI
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prix de vente (Ar) *</Label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    required
                    className="rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label>Prix d'achat (Ar)</Label>
                  <Input
                    type="number"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0"
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stock initial</Label>
                  <Input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label>Stock minimum</Label>
                  <Input
                    type="number"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="5"
                    className="rounded-xl mt-1"
                  />
                </div>
              </div>

              {/* Photo seulement pour produits */}
              <div>
                <Label>Photo du produit</Label>
                <div className="mt-2 space-y-3">
                  {formData.image_url && (
                    <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-100">
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image_url: '' })}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-600 hover:bg-blue-50 transition-colors">
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {uploadingImage ? 'Upload en cours...' : 'Télécharger une photo'}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="Ou entrez l'URL de l'image..."
                    className="rounded-xl"
                  />
                </div>
              </div>
            </>
          )}

          {/* Produit actif */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex-1">
              <Label className="cursor-pointer font-semibold text-gray-900 text-base">
                {formData.is_ingredient ? 'Ingrédient' : 'Produit'} actif
              </Label>
              <p className="text-xs text-gray-600 mt-1">
                {formData.is_active ? '✓ Visible et utilisable' : 'Masqué et non utilisable'}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                className="data-[state=checked]:bg-green-600"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {product && (
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
              disabled={isProcessing || !formData.name || (!formData.is_ingredient && !formData.price)}
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