import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, Package, Save, Trash2, Upload, X, ChefHat, BookOpen, Plus, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useQuery } from '@tanstack/react-query';

const UNITS = ['kg', 'L', 'litre', 'pièce', 'pièces', 'g', 'mL', 'sachet', 'sachets', 'bouteille', 'canette', 'verre'];

const PRODUCT_TYPES = [
  {
    value: 'direct',
    label: 'Vente directe',
    desc: 'Produit fini vendu tel quel (boisson, pain...)',
    icon: Package,
    color: 'blue',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    ring: 'ring-blue-500',
    active: 'bg-blue-600'
  },
  {
    value: 'recipe',
    label: 'Recette / Préparation',
    desc: 'Produit fabriqué à partir de matières premières (brochette...)',
    icon: BookOpen,
    color: 'green',
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-900',
    ring: 'ring-green-500',
    active: 'bg-green-600'
  },
  {
    value: 'raw_material',
    label: 'Matière première',
    desc: 'Ingrédient de base utilisé dans les recettes (viande, huile...)',
    icon: ChefHat,
    color: 'orange',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-900',
    ring: 'ring-orange-500',
    active: 'bg-orange-600'
  }
];

function getDefaultUnit(productType) {
  return productType === 'raw_material' ? 'kg' : 'pièce';
}

export default function ProductForm({ open, onClose, product, categories, onSave, onDelete }) {
  const { getCurrencySymbol, convertAmount, convertToAriary } = useCurrency();
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    cost_price: '',
    stock: '',
    min_stock: '',
    image_url: '',
    is_active: true,
    product_type: 'direct',
    unit: 'pièce',
    track_stock: true,
    has_packaging: false,
    bottle_deposit_price: '',
    crate_deposit_price: '',
    bottles_per_crate: '24'
  });
  const [recipeRows, setRecipeRows] = useState([]); // [{ raw_material_id, quantity_per_batch }]
  const [recipeBatchSize, setRecipeBatchSize] = useState(''); // unique pour toute la recette
  const [recipeSearches, setRecipeSearches] = useState({}); // { [idx]: searchQuery }
  const [recipeDropdownOpen, setRecipeDropdownOpen] = useState({}); // { [idx]: bool }
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false);
  const [lastProductId, setLastProductId] = useState(undefined);

  // Load raw materials for recipe builder
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: open
  });
  const rawMaterials = allProducts.filter(p => p.product_type === 'raw_material' || p.is_ingredient === 1 || p.is_ingredient === true);

  // Auto-compute cost price from recipe ingredients
  const computedCostPrice = useMemo(() => {
    if (formData.product_type !== 'recipe') return null;
    const batchSize = Number(recipeBatchSize);
    if (!batchSize || batchSize <= 0 || recipeRows.length === 0) return null;
    let total = 0;
    for (const row of recipeRows) {
      if (!row.raw_material_id || !row.quantity_per_batch) return null;
      const mat = rawMaterials.find(m => m.id === row.raw_material_id);
      if (!mat || !mat.cost_price) return null;
      total += (Number(row.quantity_per_batch) / batchSize) * Number(mat.cost_price);
    }
    return Math.round(total * 100) / 100;
  }, [formData.product_type, recipeRows, recipeBatchSize, rawMaterials]);

  // Sync computed cost price into formData whenever it changes
  useEffect(() => {
    if (computedCostPrice !== null) {
      setFormData(prev => ({ ...prev, cost_price: computedCostPrice.toString() }));
    }
  }, [computedCostPrice]);

  useEffect(() => {
    const productId = product?.id || 'new';
    if (open && lastProductId !== productId) {
      if (product) {
        // Derive product_type: use explicit field if present, else fallback from is_ingredient
        const ptype = product.product_type || (product.is_ingredient ? 'raw_material' : 'direct');
        setFormData({
          name: product.name || '',
          category_id: product.category_id || 'none',
          price: product.price ? convertAmount(product.price).toString() : '',
          cost_price: product.cost_price ? convertAmount(product.cost_price).toString() : '',
          stock: product.stock?.toString() || '',
          min_stock: product.min_stock?.toString() || '',
          image_url: product.image_url || '',
          is_active: !!product.is_active,
          product_type: ptype,
          unit: product.unit || getDefaultUnit(ptype),
          track_stock: product.track_stock === undefined ? true : !!product.track_stock,
          has_packaging: !!product.has_packaging,
          bottle_deposit_price: product.bottle_deposit_price ? convertAmount(product.bottle_deposit_price).toString() : '',
          crate_deposit_price: product.crate_deposit_price ? convertAmount(product.crate_deposit_price).toString() : '',
          bottles_per_crate: product.bottles_per_crate?.toString() || '24'
        });

        // Load recipe if recipe product
        if (ptype === 'recipe' && product.id) {
          fetch(`/api/products/${product.id}/recipe`)
            .then(r => r.json())
            .then(rows => {
              // batch_size is shared across all rows — take from first row
              if (rows.length > 0) setRecipeBatchSize(rows[0].batch_size.toString());
              setRecipeRows(rows.map(r => ({
                raw_material_id: r.raw_material_id,
                quantity_per_batch: r.quantity_per_batch
              })));
            })
            .catch(() => { setRecipeRows([]); setRecipeBatchSize(''); });
        } else {
          setRecipeRows([]);
          setRecipeBatchSize('');
        }
      } else {
        setFormData({
          name: '',
          category_id: 'none',
          price: '',
          cost_price: '',
          stock: '',
          min_stock: '',
          image_url: '',
          is_active: true,
          product_type: 'direct',
          unit: 'pièce',
          track_stock: true,
          has_packaging: false,
          bottle_deposit_price: '',
          crate_deposit_price: '',
          bottles_per_crate: '24'
        });
        setRecipeRows([]);
        setRecipeBatchSize('');
      }
      setLastProductId(productId);

      setTimeout(() => {
        const firstInput = document.querySelector('input[name="product-name"]');
        if (firstInput) {
          firstInput.focus();
          const val = firstInput.value;
          firstInput.value = '';
          firstInput.value = val;
        }
      }, 300);
    }
  }, [product, open, lastProductId]);

  const handleTypeChange = (newType) => {
    setFormData(prev => ({
      ...prev,
      product_type: newType,
      unit: getDefaultUnit(newType),
      track_stock: newType === 'raw_material' ? true : prev.track_stock
    }));
    if (newType !== 'recipe') { setRecipeRows([]); setRecipeBatchSize(''); }
  };

  const addRecipeRow = () => {
    setRecipeRows(prev => [...prev, { raw_material_id: '', quantity_per_batch: '' }]);
  };

  const removeRecipeRow = (idx) => {
    setRecipeRows(prev => prev.filter((_, i) => i !== idx));
    setRecipeSearches(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setRecipeDropdownOpen(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  const updateRecipeRow = (idx, field, value) => {
    setRecipeRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.unit) {
      toast.error("Veuillez sélectionner une unité de mesure.");
      return;
    }
    if (formData.product_type === 'recipe' && recipeRows.length === 0) {
      toast.error("Ajoutez au moins une matière première à la recette.");
      return;
    }
    if (formData.product_type === 'recipe') {
      if (!recipeBatchSize || Number(recipeBatchSize) <= 0) {
        toast.error("Indiquez le nombre de portions obtenues par la recette.");
        return;
      }
      for (const row of recipeRows) {
        if (!row.raw_material_id || !row.quantity_per_batch) {
          toast.error("Complétez toutes les lignes de la recette.");
          return;
        }
      }
    }
    setIsProcessing(true);
    try {
      const savedProduct = await onSave({
        ...formData,
        is_ingredient: formData.product_type === 'raw_material',
        category_id: (formData.category_id === 'none' || !formData.category_id) ? null : formData.category_id,
        price: convertToAriary(Number(formData.price)) || 0,
        cost_price: convertToAriary(Number(formData.cost_price)) || 0,
        stock: Number(formData.stock) || 0,
        min_stock: Number(formData.min_stock) || 5,
        has_packaging: formData.has_packaging,
        bottle_deposit_price: convertToAriary(Number(formData.bottle_deposit_price)) || 0,
        crate_deposit_price: convertToAriary(Number(formData.crate_deposit_price)) || 0,
        bottles_per_crate: Number(formData.bottles_per_crate) || 24
      });

      // Save recipe if applicable
      if (formData.product_type === 'recipe') {
        const pid = savedProduct?.id || product?.id;
        if (pid) {
          await fetch(`/api/products/${pid}/recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ingredients: recipeRows.map(r => ({
                raw_material_id: r.raw_material_id,
                quantity_per_batch: Number(r.quantity_per_batch),
                batch_size: Number(recipeBatchSize)
              }))
            })
          });
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      await onDelete(product.id);
    } finally {
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

  const activeType = PRODUCT_TYPES.find(t => t.value === formData.product_type) || PRODUCT_TYPES[0];
  const isRawMaterial = formData.product_type === 'raw_material';
  const isRecipe = formData.product_type === 'recipe';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <activeType.icon className={`w-5 h-5 text-${activeType.color}-600`} />
            {product ? 'Modifier' : 'Nouveau'} {activeType.label.toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <form key={product?.id || 'new-product-form'} onSubmit={handleSubmit} className="space-y-4 py-4">

          {/* Type de produit */}
          <div className="space-y-2">
            <Label className="font-bold text-gray-800">Type de produit *</Label>
            <div className="grid grid-cols-3 gap-2">
              {PRODUCT_TYPES.map(t => {
                const Icon = t.icon;
                const isSelected = formData.product_type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => handleTypeChange(t.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                      isSelected
                        ? `${t.bg} ${t.border} ${t.text} shadow-sm`
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? `text-${t.color}-600` : 'text-gray-400'}`} />
                    <span className="text-xs font-semibold leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <p className={`text-xs ${activeType.text} ${activeType.bg} rounded-lg px-3 py-2`}>
              {activeType.desc}
            </p>
          </div>

          {/* Nom */}
          <div>
            <Label>{isRawMaterial ? 'Nom de l\'ingrédient' : isRecipe ? 'Nom du produit / plat' : 'Nom du produit'} *</Label>
            <Input
              autoFocus
              name="product-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={isRawMaterial ? "Ex: Huile de tournesol" : isRecipe ? "Ex: Brochette" : "Ex: Coca-Cola 33cl"}
              required
              className="rounded-xl mt-1"
            />
          </div>

          {/* Catégorie et Unité */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <Label>Catégorie</Label>
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className="truncate">
                    {formData.category_id === 'none' ? 'Aucune' : categories.find(c => c.id === formData.category_id)?.name || "Sélectionner"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </button>
                {isCategoryMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsCategoryMenuOpen(false)} />
                    <div className="absolute left-0 top-full z-[70] mt-1 w-full max-h-60 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                      <button type="button" onClick={() => { setFormData({ ...formData, category_id: 'none' }); setIsCategoryMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${formData.category_id === 'none' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                        Aucune catégorie
                      </button>
                      {categories.map((cat) => (
                        <button key={cat.id} type="button"
                          onClick={() => { setFormData({ ...formData, category_id: cat.id }); setIsCategoryMenuOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${formData.category_id === cat.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div>
              <Label>Unité *</Label>
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => setIsUnitMenuOpen(!isUnitMenuOpen)}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span>{formData.unit || "Unité"}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </button>
                {isUnitMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsUnitMenuOpen(false)} />
                    <div className="absolute left-0 top-full z-[70] mt-1 w-full max-h-60 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                      {UNITS.map(u => (
                        <button key={u} type="button"
                          onClick={() => { setFormData({ ...formData, unit: u }); setIsUnitMenuOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${formData.unit === u ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Champs selon type */}
          {isRawMaterial ? (
            <>
              <div>
                <Label>Coût unitaire ({getCurrencySymbol()}) *</Label>
                <Input type="number" value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  placeholder="0" required step="any" className="rounded-xl mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stock initial</Label>
                  <Input type="number" step="0.01" value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0" className="rounded-xl mt-1" />
                </div>
                <div>
                  <Label>Stock minimum</Label>
                  <Input type="number" step="0.01" value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="5" className="rounded-xl mt-1" />
                </div>
              </div>
            </>
          ) : isRecipe ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prix de vente ({getCurrencySymbol()}) *</Label>
                  <Input type="number" value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0" required step="any" className="rounded-xl mt-1" />
                </div>
                <div>
                  <Label>Prix d'achat ({getCurrencySymbol()})</Label>
                  <Input type="number" value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0" step="any" className={`rounded-xl mt-1 ${computedCostPrice !== null ? 'bg-green-50 border-green-300' : ''}`} />
                  {computedCostPrice !== null && (
                    <p className="text-xs text-green-700 mt-1">Calculé depuis la recette</p>
                  )}
                </div>
              </div>

              {/* Section Recette */}
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 space-y-3">
                <Label className="font-bold text-green-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Recette — Matières premières
                </Label>

                {/* Portions globales */}
                <div className="bg-white rounded-xl p-3 border border-green-200">
                  <Label className="text-xs font-semibold text-green-800">
                    Cette recette produit combien de {formData.unit || 'portions'} ?
                  </Label>
                  <Input type="number" step="any" min="1"
                    value={recipeBatchSize}
                    onChange={(e) => setRecipeBatchSize(e.target.value)}
                    placeholder="ex: 40"
                    className="rounded-xl mt-1 text-sm" />
                  {recipeBatchSize && Number(recipeBatchSize) > 0 && (
                    <p className="text-xs text-green-700 mt-1">
                      1 préparation = <strong>{recipeBatchSize}</strong> {formData.unit || 'portions'}
                    </p>
                  )}
                </div>

                {/* Ingrédients */}
                <Label className="text-xs font-semibold text-green-800">Ingrédients nécessaires :</Label>

                {recipeRows.length === 0 && (
                  <p className="text-xs text-green-700 text-center py-2">
                    Aucun ingrédient. Cliquez sur "Ajouter".
                  </p>
                )}

                {recipeRows.map((row, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-3 space-y-2 border border-green-200">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        {/* Matière première — dropdown avec recherche */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setRecipeDropdownOpen(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <span className={row.raw_material_id ? 'text-gray-900' : 'text-gray-400'}>
                              {row.raw_material_id
                                ? rawMaterials.find(m => m.id === row.raw_material_id)?.name || 'Sélectionner...'
                                : 'Sélectionner une matière première...'}
                            </span>
                            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                          </button>

                          {recipeDropdownOpen[idx] && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg">
                              {/* Barre de recherche */}
                              <div className="p-2 border-b border-gray-100">
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                  <input
                                    type="text"
                                    autoFocus
                                    value={recipeSearches[idx] || ''}
                                    onChange={(e) => setRecipeSearches(prev => ({ ...prev, [idx]: e.target.value }))}
                                    placeholder="Rechercher..."
                                    className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </div>
                              </div>
                              {/* Liste filtrée avec scroll */}
                              <div className="max-h-48 overflow-y-auto p-1">
                                {rawMaterials
                                  .filter(m => !recipeSearches[idx] || m.name.toLowerCase().includes(recipeSearches[idx].toLowerCase()))
                                  .map(m => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        updateRecipeRow(idx, 'raw_material_id', m.id);
                                        setRecipeDropdownOpen(prev => ({ ...prev, [idx]: false }));
                                        setRecipeSearches(prev => ({ ...prev, [idx]: '' }));
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-blue-50 hover:text-blue-900 ${row.raw_material_id === m.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700'}`}
                                    >
                                      <span className="font-medium">{m.name}</span>
                                      <span className="text-xs text-gray-400 ml-2">({m.unit}) — stock: {Number(m.stock).toFixed(2)}</span>
                                    </button>
                                  ))}
                                {rawMaterials.filter(m => !recipeSearches[idx] || m.name.toLowerCase().includes(recipeSearches[idx].toLowerCase())).length === 0 && (
                                  <p className="text-xs text-gray-400 text-center py-3">Aucun résultat</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Quantité nécessaire pour toute la préparation */}
                        <div>
                          <Label className="text-xs text-gray-600">
                            Quantité pour {recipeBatchSize || '?'} {formData.unit || 'portions'}
                            {row.raw_material_id && (() => {
                              const mat = rawMaterials.find(m => m.id === row.raw_material_id);
                              return mat ? ` (${mat.unit})` : '';
                            })()}
                          </Label>
                          <Input type="number" step="any" min="0.001"
                            value={row.quantity_per_batch}
                            onChange={(e) => updateRecipeRow(idx, 'quantity_per_batch', e.target.value)}
                            placeholder="ex: 1"
                            className="rounded-xl mt-1 text-sm" />
                        </div>

                        {/* Affichage calcul par portion */}
                        {row.quantity_per_batch && recipeBatchSize && Number(recipeBatchSize) > 0 && (
                          <p className="text-xs text-green-700 bg-green-100 rounded-lg px-2 py-1">
                            → 1 {formData.unit || 'portion'} consomme{' '}
                            <strong>{(Number(row.quantity_per_batch) / Number(recipeBatchSize)).toFixed(4)}</strong>{' '}
                            {rawMaterials.find(m => m.id === row.raw_material_id)?.unit || ''}
                            {row.raw_material_id && ` de ${rawMaterials.find(m => m.id === row.raw_material_id)?.name || ''}`}
                          </p>
                        )}
                      </div>

                      <button type="button" onClick={() => removeRecipeRow(idx)}
                        className="mt-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRecipeRow}
                  className="w-full flex items-center justify-center gap-1 text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700">
                  <Plus className="w-3 h-3" /> Ajouter un ingrédient
                </button>
              </div>
            </>
          ) : (
            // Vente directe
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prix de vente ({getCurrencySymbol()}) *</Label>
                  <Input type="number" value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0" required step="any" className="rounded-xl mt-1" />
                </div>
                <div>
                  <Label>Prix d'achat ({getCurrencySymbol()})</Label>
                  <Input type="number" value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0" step="any" className="rounded-xl mt-1" />
                </div>
              </div>
              {formData.track_stock && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stock initial</Label>
                    <Input type="number" value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0" step="any" className="rounded-xl mt-1" />
                  </div>
                  <div>
                    <Label>Stock minimum</Label>
                    <Input type="number" value={formData.min_stock}
                      onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                      placeholder="5" step="any" className="rounded-xl mt-1" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Photo */}
          <div>
            <Label>Photo</Label>
            <div className="mt-2 space-y-3">
              {formData.image_url && (
                <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-100">
                  <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setFormData({ ...formData, image_url: '' })}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <label className="cursor-pointer">
                <div className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition-colors`}>
                  <Upload className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{uploadingImage ? 'Upload...' : 'Télécharger une photo'}</span>
                </div>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="hidden" />
              </label>
              <Input value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="Ou entrez l'URL de l'image..." className="rounded-xl" />
            </div>
          </div>

          {/* Produit actif */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex-1">
              <Label onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                className="cursor-pointer font-semibold text-gray-900 text-base">
                {isRawMaterial ? 'Ingrédient' : 'Produit'} actif
              </Label>
              <p className="text-xs text-gray-600 mt-1">{formData.is_active ? '✓ Visible et utilisable' : 'Masqué et non utilisable'}</p>
            </div>
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${formData.is_active ? 'bg-green-600' : 'bg-gray-400'}`}>
              <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${formData.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Suivre le stock — uniquement pour vente directe */}
          {!isRawMaterial && !isRecipe && (
            <div className="flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex-1">
                <Label onClick={() => setFormData(prev => ({ ...prev, track_stock: !prev.track_stock }))}
                  className="cursor-pointer font-semibold text-blue-900 text-base">
                  Suivre le stock
                </Label>
                <p className="text-xs text-blue-700 mt-1">
                  {formData.track_stock ? '✓ Stock géré automatiquement' : 'Stock non suivi (service, produit numérique...)'}
                </p>
              </div>
              <button type="button" onClick={() => setFormData(prev => ({ ...prev, track_stock: !prev.track_stock }))}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${formData.track_stock ? 'bg-blue-600' : 'bg-gray-400'}`}>
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${formData.track_stock ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Gestion des Emballages (Consignes) */}
          {!isRawMaterial && !isRecipe && (
            <div className={`rounded-xl p-4 border transition-all ${formData.has_packaging ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <Label onClick={() => setFormData(prev => ({ ...prev, has_packaging: !prev.has_packaging }))}
                    className={`cursor-pointer font-semibold text-base flex items-center gap-2 ${formData.has_packaging ? 'text-orange-900' : 'text-gray-700'}`}>
                    <Package className="w-5 h-5" /> Ce produit utilise des emballages consignés
                  </Label>
                  <p className={`text-xs mt-1 ${formData.has_packaging ? 'text-orange-700' : 'text-gray-500'}`}>
                    {formData.has_packaging ? 'Les bouteilles et cageots seront suivis automatiquement.' : 'Activer pour lier des emballages (ex: Bouteilles THB).'}
                  </p>
                </div>
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, has_packaging: !prev.has_packaging }))}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${formData.has_packaging ? 'bg-orange-600' : 'bg-gray-400'}`}>
                  <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${formData.has_packaging ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {formData.has_packaging && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-orange-900">Consigne Bouteille ({getCurrencySymbol()})</Label>
                    <Input type="number" step="any" value={formData.bottle_deposit_price}
                      onChange={(e) => setFormData({ ...formData, bottle_deposit_price: e.target.value })}
                      placeholder="0" className="rounded-xl mt-1 bg-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-orange-900">Consigne Cageot ({getCurrencySymbol()})</Label>
                    <Input type="number" step="any" value={formData.crate_deposit_price}
                      onChange={(e) => setFormData({ ...formData, crate_deposit_price: e.target.value })}
                      placeholder="0" className="rounded-xl mt-1 bg-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-orange-900">Bouteilles / Cageot</Label>
                    <Input type="number" value={formData.bottles_per_crate}
                      onChange={(e) => setFormData({ ...formData, bottles_per_crate: e.target.value })}
                      placeholder="24" className="rounded-xl mt-1 bg-white" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {product && (
              <Button type="button" variant="outline" onClick={handleDelete} disabled={isProcessing}
                className="text-red-500 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl" disabled={isProcessing}>
              Annuler
            </Button>
            <Button type="submit"
              disabled={isProcessing || !formData.name || (!isRawMaterial && !isRecipe && !formData.price) || (isRecipe && !formData.price)}
              className={`flex-1 text-white rounded-xl bg-gradient-to-r ${
                isRawMaterial ? 'from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600' :
                isRecipe ? 'from-green-600 to-green-500 hover:from-green-700 hover:to-green-600' :
                'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
              }`}>
              <Save className="w-4 h-4 mr-2" />
              {isProcessing ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
