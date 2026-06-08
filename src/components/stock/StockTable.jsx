import React from 'react';
import { formatAmount, formatQuantity } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Edit, TrendingDown, TrendingUp, ChefHat } from 'lucide-react';

export default function StockTable({ products, categories, onEdit }) {
  const { formatCurrency } = useCurrency();
  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || 'Sans catégorie';
  };

  const getStockStatus = (product) => {
    if (product.stock <= 0) return { label: 'Rupture', color: 'bg-red-100 text-red-700' };
    if (product.stock <= (product.min_stock || 5)) return { label: 'Critique', color: 'bg-amber-100 text-amber-700' };
    return { label: 'En stock', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Produit</TableHead>
              <TableHead className="font-semibold">Catégorie</TableHead>
              <TableHead className="font-semibold text-right">Prix vente</TableHead>
              <TableHead className="font-semibold text-right">Prix achat</TableHead>
              <TableHead className="font-semibold text-center">Stock</TableHead>
              <TableHead className="font-semibold text-center">Vides</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const status = getStockStatus(product);
              return (
                <TableRow
                  key={product.id}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <span className="font-semibold text-orange-600">{product.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 flex items-center gap-1">
                          {product.name}
                          {product.product_type === 'recipe' && (
                            <ChefHat className="w-3.5 h-3.5 text-green-600" title="Stock calculé depuis les matières premières" />
                          )}
                        </p>
                        {product.stock <= (product.min_stock || 5) && product.stock > 0 && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Stock bas
                          </p>
                        )}
                        {product.product_type === 'recipe' && (
                          <p className="text-xs text-green-700">~{product.stock ?? 0} réalisable{product.stock > 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {getCategoryName(product.category_id)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-800">
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell className="text-right text-gray-600">
                    {product.cost_price ? formatCurrency(product.cost_price) : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${product.stock <= 0 ? 'text-red-600' : product.stock <= (product.min_stock || 5) ? 'text-amber-600' : 'text-gray-800'}`}>
                      {product.product_type === 'recipe' ? '~' : ''}{formatQuantity(product.stock, product.unit)} {product.unit}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-gray-600 text-sm">
                    {product.has_packaging ? (
                      <div className="flex flex-col gap-1 items-center">
                        <span title="Unités/Bouteilles vides" className="font-medium text-purple-700">{product.empty_packaging_qty || 0} U</span>
                        {product.secondary_packaging_type_id && (
                          <span title="Cageots vides" className="text-xs font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{product.empty_secondary_packaging_qty || 0} C</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${status.color} border-0`}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {product.product_type === 'recipe' ? (
                      <span className="text-xs text-gray-400 italic">Auto</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(product)}
                        className="text-gray-500 hover:text-orange-600"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}