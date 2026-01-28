import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, Package, FolderOpen, Plus,
  Search, Edit, Trash2, Coffee, Pizza, Sandwich, GlassWater, IceCream, UtensilsCrossed,
  Store
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProductForm from '@/components/settings/ProductForm';
import CategoryForm from '@/components/settings/CategoryForm';
import BusinessSettings from '@/components/settings/BusinessSettings';

import DataSettings from '@/components/settings/DataSettings';

const iconMap = {
  coffee: Coffee,
  pizza: Pizza,
  sandwich: Sandwich,
  drink: GlassWater,
  dessert: IceCream,
  default: UtensilsCrossed
};

export default function Settings() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  // Product mutations
  const createProductMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
      setSelectedProduct(null);
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
      setSelectedProduct(null);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowProductForm(false);
      setSelectedProduct(null);
    }
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
    }
  });

  const handleSaveProduct = async (data) => {
    if (selectedProduct) {
      await updateProductMutation.mutateAsync({ id: selectedProduct.id, data });
    } else {
      await createProductMutation.mutateAsync(data);
    }
  };

  const handleSaveCategory = async (data) => {
    if (selectedCategory) {
      await updateCategoryMutation.mutateAsync({ id: selectedCategory.id, data });
    } else {
      await createCategoryMutation.mutateAsync(data);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || 'Sans catégorie';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-blue-600" />
            Paramètres
          </h1>
          <p className="text-gray-500">Gérez vos produits, catégories et données</p>
        </div>

        <Tabs defaultValue="business" className="space-y-6">
          <TabsList className="bg-white/80 p-1 rounded-xl shadow-sm">
            <TabsTrigger value="business" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
              <Store className="w-4 h-4 mr-2" />
              Snack-Bar
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
              <Package className="w-4 h-4 mr-2" />
              Produits
            </TabsTrigger>
            <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
              <FolderOpen className="w-4 h-4 mr-2" />
              Catégories
            </TabsTrigger>
            <TabsTrigger value="data" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
              <FolderOpen className="w-4 h-4 mr-2" />
              Données
            </TabsTrigger>
          </TabsList>

          {/* Business settings tab */}
          <TabsContent value="business">
            <BusinessSettings />
          </TabsContent>

          {/* Data settings tab */}
          <TabsContent value="data">
            <DataSettings />
          </TabsContent>

          {/* Products tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="pl-10 rounded-xl"
                />
              </div>
              <Button
                onClick={() => {
                  setSelectedProduct(null);
                  setShowProductForm(true);
                }}
                className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouveau produit
              </Button>
            </div>

            {/* Products grouped by category */}
            {categories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Créez d'abord des catégories</p>
                <p className="text-sm">Les produits seront organisés par catégorie</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Products without category */}
                {filteredProducts.filter(p => !p.category_id).length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-gray-800">Sans catégorie</h3>
                        <p className="text-sm text-gray-500">
                          {filteredProducts.filter(p => !p.category_id).length} produit(s)
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
                      {filteredProducts
                        .filter(p => !p.category_id)
                        .map((product, index) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.02 }}
                          >
                            <Card
                              className="cursor-pointer hover:shadow-md hover:scale-105 transition-all duration-200 h-full"
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowProductForm(true);
                              }}
                            >
                              <CardContent className="p-2">
                                <div className="flex flex-col items-center text-center space-y-1.5">
                                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center overflow-hidden">
                                    {product.image_url ? (
                                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-xl font-bold text-blue-600">{product.name.charAt(0)}</span>
                                    )}
                                  </div>
                                  <div className="w-full">
                                    <h4 className="font-semibold text-sm text-gray-800 truncate" title={product.name}>
                                      {product.name}
                                    </h4>
                                    <p className="text-xs font-bold text-blue-600 mt-1">
                                      {product.price?.toLocaleString()} Ar
                                    </p>
                                    <div className="flex items-center justify-between mt-2 text-xs">
                                      <span className="text-gray-500">Stock: {product.stock || 0}</span>
                                      <Badge
                                        variant={product.is_active !== false ? 'default' : 'secondary'}
                                        className={`text-xs px-1.5 py-0 ${product.is_active !== false ? 'bg-green-100 text-green-700' : ''}`}
                                      >
                                        {product.is_active !== false ? '✓' : '✗'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Products by category */}
                {categories.map((category) => {
                  const categoryProducts = filteredProducts.filter(p => p.category_id === category.id);
                  if (categoryProducts.length === 0) return null;

                  const Icon = iconMap[category.icon] || iconMap.default;

                  return (
                    <div key={category.id}>
                      <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-md">
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-800">{category.name}</h3>
                          <p className="text-sm text-gray-500">{categoryProducts.length} produit(s)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
                        {categoryProducts.map((product, index) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.02 }}
                          >
                            <Card
                              className="cursor-pointer hover:shadow-md hover:scale-105 transition-all duration-200 h-full"
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowProductForm(true);
                              }}
                            >
                              <CardContent className="p-2">
                                <div className="flex flex-col items-center text-center space-y-1.5">
                                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center overflow-hidden">
                                    {product.image_url ? (
                                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-xl font-bold text-blue-600">{product.name.charAt(0)}</span>
                                    )}
                                  </div>
                                  <div className="w-full">
                                    <h4 className="font-semibold text-sm text-gray-800 truncate" title={product.name}>
                                      {product.name}
                                    </h4>
                                    <p className="text-xs font-bold text-blue-600 mt-1">
                                      {product.price?.toLocaleString()} Ar
                                    </p>
                                    <div className="flex items-center justify-between mt-2 text-xs">
                                      <span className="text-gray-500">Stock: {product.stock || 0}</span>
                                      <Badge
                                        variant={product.is_active !== false ? 'default' : 'secondary'}
                                        className={`text-xs px-1.5 py-0 ${product.is_active !== false ? 'bg-green-100 text-green-700' : ''}`}
                                      >
                                        {product.is_active !== false ? '✓' : '✗'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Aucun produit trouvé</p>
                    <p className="text-sm">Créez votre premier produit</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Categories tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setSelectedCategory(null);
                  setShowCategoryForm(true);
                }}
                className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle catégorie
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {categories.map((category, index) => {
                const Icon = iconMap[category.icon] || iconMap.default;
                const productCount = products.filter(p => p.category_id === category.id).length;

                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => {
                        setSelectedCategory(category);
                        setShowCategoryForm(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-800">{category.name}</h3>
                            <p className="text-sm text-gray-500">{productCount} produit(s)</p>
                          </div>
                          <Edit className="w-4 h-4 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aucune catégorie</p>
                <p className="text-sm">Créez votre première catégorie</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Product form modal */}
        <ProductForm
          open={showProductForm}
          onClose={() => {
            setShowProductForm(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          categories={categories}
          onSave={handleSaveProduct}
          onDelete={(id) => deleteProductMutation.mutate(id)}
        />

        {/* Category form modal */}
        <CategoryForm
          open={showCategoryForm}
          onClose={() => {
            setShowCategoryForm(false);
            setSelectedCategory(null);
          }}
          category={selectedCategory}
          onSave={handleSaveCategory}
          onDelete={(id) => deleteCategoryMutation.mutate(id)}
        />
      </div>
    </div>
  );
}