import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, Package, FolderOpen, Plus,
  Search, Edit, Trash2, GlassWater, Utensils,
  ShoppingBasket, Store, Tag, Shirt, Pill, Wrench, Bike, Smartphone, LayoutGrid,
  RefreshCw, ChevronDown, FileUp
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ProductForm from '@/components/settings/ProductForm';
import ProductImportExcel from '@/components/settings/ProductImportExcel';
import CategoryForm from '@/components/settings/CategoryForm';
import BusinessSettings from '@/components/settings/BusinessSettings';

import DataSettings from '@/components/settings/DataSettings';
import AuditLogs from '@/components/settings/AuditLogs';
import PasswordChange from '@/components/settings/PasswordChange';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Lock } from 'lucide-react';

const iconMap = {
  default: LayoutGrid,
  basket: ShoppingBasket,
  store: Store,
  tag: Tag,
  shirt: Shirt,
  pill: Pill,
  wrench: Wrench,
  bike: Bike,
  phone: Smartphone,
  utensils: Utensils,
  drink: GlassWater,
};

const categoryColors = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
];

export default function Settings() {
  const { formatCurrency } = useCurrency();
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');
  const [isCategoryFilterMenuOpen, setIsCategoryFilterMenuOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: products = [], isLoading: loadingProducts, isRefetching: refetchingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: categories = [], isLoading: loadingCategories, isRefetching: refetchingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const handleRefresh = () => {
    refetchProducts();
    refetchCategories();
  };

  const isRefreshing = refetchingProducts || refetchingCategories || loadingProducts || loadingCategories;

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
      toast.success('Produit supprimé avec succès');
      // Adding a small delay to allow the animation/focus-trap to cleanup 
      // before resetting the modal state
      setTimeout(() => {
        setShowProductForm(false);
        setSelectedProduct(null);
      }, 100);
    },
    onError: (error) => {
      toast.error(`Erreur lors de la suppression: ${error.message}`);
    }
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
      toast.success('Catégorie créée avec succès');
    },
    onError: (error) => {
      toast.error(`Erreur lors de la création: ${error.message}`);
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
      toast.success('Catégorie mise à jour avec succès');
    },
    onError: (error) => {
      toast.error(`Erreur lors de la mise à jour: ${error.message}`);
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCategoryForm(false);
      setSelectedCategory(null);
      toast.success('Catégorie supprimée avec succès');
    },
    onError: (error) => {
      toast.error(`Erreur lors de la suppression: ${error.message}`);
    }
  });

  const handleSaveProduct = async (data) => {
    if (selectedProduct) {
      return await updateProductMutation.mutateAsync({ id: selectedProduct.id, data });
    } else {
      return await createProductMutation.mutateAsync(data);
    }
  };

  const handleSaveCategory = async (data) => {
    if (selectedCategory) {
      await updateCategoryMutation.mutateAsync({ id: selectedCategory.id, data });
    } else {
      await createCategoryMutation.mutateAsync(data);
    }
  };

  const filteredProducts = products.filter(p => {
    if (!p || !p.name) return false;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategoryFilter === 'all' || p.category_id === activeCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c && c.id === categoryId);
    return cat?.name || 'Sans catégorie';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <SettingsIcon className="w-7 h-7 text-blue-600" />
              Paramètres
            </h1>
            <p className="text-gray-500">Gérez vos produits, catégories et données</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-xl bg-white shadow-sm hover:shadow-md transition-all gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        <Tabs defaultValue="business" className="space-y-6">
          <TabsList className="bg-white/80 p-1 rounded-xl shadow-sm">
            <TabsTrigger value="business" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
              <Store className="w-4 h-4 mr-2" />
              Boutique
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
            {isAdmin() && (
              <>
                <TabsTrigger value="audit" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-purple-500 data-[state=active]:text-white">
                  <FileText className="w-4 h-4 mr-2" />
                  Journaux
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="password" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-green-500 data-[state=active]:text-white">
              <Lock className="w-4 h-4 mr-2" />
              Mot de passe
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

          {/* Audit Logs tab (Admin only) */}
          {isAdmin() && (
            <TabsContent value="audit">
              <AuditLogs />
            </TabsContent>
          )}

          {/* Password Change tab */}
          <TabsContent value="password">
            <PasswordChange />
          </TabsContent>

          {/* Products tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="flex flex-1 gap-3 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un produit..."
                    className="pl-10 rounded-xl bg-white"
                  />
                </div>

                {/* Category Filter Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCategoryFilterMenuOpen(!isCategoryFilterMenuOpen)}
                    className="flex h-10 w-[200px] items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-gray-400" />
                      <span className="truncate">
                        {activeCategoryFilter === 'all' ? 'Toutes catégories' : categories.find(c => c.id === activeCategoryFilter)?.name}
                      </span>
                    </div>
                    <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isCategoryFilterMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCategoryFilterMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsCategoryFilterMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in duration-200">
                        <button
                          onClick={() => {
                            setActiveCategoryFilter('all');
                            setIsCategoryFilterMenuOpen(false);
                          }}
                          className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${activeCategoryFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
                        >
                          Toutes catégories
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <div className="max-h-60 overflow-y-auto">
                          {categories.map(cat => (
                            <button
                              key={cat.id}
                              onClick={() => {
                                setActiveCategoryFilter(cat.id);
                                setIsCategoryFilterMenuOpen(false);
                              }}
                              className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${activeCategoryFilter === cat.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowImportExcel(true)}
                  className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 gap-2"
                >
                  <FileUp className="w-4 h-4" />
                  Importer via Excel
                </Button>
                <Button
                  onClick={() => {
                    setSelectedProduct(null);
                    setShowProductForm(true);
                  }}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau produit
                </Button>
              </div>
            </div>

            {/* Products Table categorized */}
            {categories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Créez d'abord des catégories</p>
                <p className="text-sm">Les produits seront organisés par catégorie</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead className="w-[80px]">Image</TableHead>
                      <TableHead>Désignation</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead className="text-right">Prix</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Statut</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category, catIndex) => {
                      const categoryProducts = filteredProducts.filter(p => p.category_id === category.id);
                      if (categoryProducts.length === 0) return null;

                      const colorClass = categoryColors[catIndex % categoryColors.length];
                      const Icon = iconMap[category.icon] || iconMap.default;

                      return (
                        <React.Fragment key={category.id}>
                          {/* Category Header Row */}
                          <TableRow className="bg-gray-50/30 border-y border-gray-100">
                            <TableCell colSpan={7} className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg ${colorClass.split(' ')[0]} shadow-sm`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-gray-700 uppercase tracking-wider text-xs">{category.name}</span>
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-gray-200 text-gray-500">
                                  {categoryProducts.length}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Product Rows */}
                          {categoryProducts.map((product) => (
                            <TableRow
                              key={product.id}
                              className="group hover:bg-blue-50/30 cursor-pointer transition-colors"
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowProductForm(true);
                              }}
                            >
                              <TableCell>
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                                  {product.image_url ? (
                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-sm font-bold text-gray-400">{product.name.charAt(0)}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-gray-800">{product.name}</TableCell>
                              <TableCell>
                                <Badge className={`${colorClass} border shadow-sm px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase`}>
                                  {category.name}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-bold text-blue-600">
                                {formatCurrency(product.price)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-mono ${product.stock <= (product.min_stock || 5) ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                  {product.stock || 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={!!product.is_active ? 'default' : 'secondary'}
                                  className={`text-[10px] ${!!product.is_active ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                                >
                                  {!!product.is_active ? 'Actif' : 'Inactif'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    {/* Products without category */}
                    {filteredProducts.filter(p => !p.category_id).length > 0 && (
                      <>
                        <TableRow className="bg-gray-50/30 border-y border-gray-100">
                          <TableCell colSpan={7} className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-gray-200 shadow-sm">
                                <Package className="w-4 h-4 text-gray-600" />
                              </div>
                              <span className="font-bold text-gray-700 uppercase tracking-wider text-xs">Sans Catégorie</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {filteredProducts.filter(p => !p.category_id).map((product) => (
                          <TableRow
                            key={product.id}
                            className="group hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setSelectedProduct(product);
                              setShowProductForm(true);
                            }}
                          >
                            <TableCell>
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-sm font-bold text-gray-400">{product.name.charAt(0)}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold text-gray-800">{product.name}</TableCell>
                            <TableCell>
                              <Badge className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">
                                Aucun
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-blue-600">
                              {formatCurrency(product.price)}
                            </TableCell>
                            <TableCell className="text-right font-mono">{product.stock || 0}</TableCell>
                            <TableCell className="text-right">
                              <Badge className={!!product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>
                                {!!product.is_active ? 'Actif' : 'Inactif'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Aucun produit trouvé</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
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
        {showProductForm && (
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
        )}

        {/* Excel Import modal */}
        {showImportExcel && (
          <ProductImportExcel
            open={showImportExcel}
            onClose={() => setShowImportExcel(false)}
            onImportDone={() => {
              queryClient.invalidateQueries({ queryKey: ['products'] });
              setShowImportExcel(false);
            }}
          />
        )}

        {/* Category form modal */}
        {showCategoryForm && (
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
        )}
      </div>
    </div>
  );
}