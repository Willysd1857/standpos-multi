import React from 'react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Edit, TrendingDown, TrendingUp } from 'lucide-react';

export default function StockTable({ products, categories, onEdit }) {
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
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Produit</TableHead>
              <TableHead className="font-semibold">Catégorie</TableHead>
              <TableHead className="font-semibold text-right">Prix vente</TableHead>
              <TableHead className="font-semibold text-right">Prix achat</TableHead>
              <TableHead className="font-semibold text-center">Stock</TableHead>
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
                        <p className="font-medium text-gray-800">{product.name}</p>
                        {product.stock <= (product.min_stock || 5) && product.stock > 0 && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Stock bas
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {getCategoryName(product.category_id)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-800">
                    {product.price?.toLocaleString()} Ar
                  </TableCell>
                  <TableCell className="text-right text-gray-600">
                    {product.cost_price?.toLocaleString() || '-'} Ar
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${product.stock <= 0 ? 'text-red-600' : product.stock <= (product.min_stock || 5) ? 'text-amber-600' : 'text-gray-800'}`}>
                      {product.stock || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${status.color} border-0`}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(product)}
                      className="text-gray-500 hover:text-orange-600"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
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