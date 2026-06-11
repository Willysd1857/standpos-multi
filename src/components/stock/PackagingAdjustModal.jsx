import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Package, Wine, Boxes, Loader2, AlertTriangle, Warehouse, Save, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAPI } from '@/api/base44Client';

export default function PackagingAdjustModal({ open, onClose, location }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState({});
  const [reason, setReason] = useState('');
  const [submittingProductId, setSubmittingProductId] = useState(null);

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setReason('');
      setSearchQuery('');
      setSubmittingProductId(null);
    }
  }, [open]);

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['location-packaging-stock', location?.id],
    queryFn: async () => {
      try {
        const res = await fetchAPI(`/locations/${location.id}/packaging-stock`);
        return res;
      } catch (err) {
        console.error('[PackagingAdjustModal] API error:', err.message, 'endpoint:', `/locations/${location.id}/packaging-stock`);
        throw err;
      }
    },
    enabled: !!open && !!location?.id,
  });

  if (queryError) {
    console.error('[PackagingAdjustModal] queryError:', queryError.message);
  }

  const items = data?.items || [];
  const totals = data?.totals || { empty_bottles: 0, empty_crates: 0 };

  if (open && data) {
    console.log('[PackagingAdjustModal] data received:', { itemCount: items.length, totals, rawItems: data.items?.length });
  }

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(i => i.product_name?.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const adjustMut = useMutation({
    mutationFn: ({ product_id, empty_packaging_qty, empty_secondary_packaging_qty, reason }) =>
      fetchAPI(`/locations/${location.id}/adjust-packaging`, {
        method: 'POST',
        body: JSON.stringify({ product_id, empty_packaging_qty, empty_secondary_packaging_qty, reason }),
      }),
    onSuccess: (res, vars) => {
      toast.success(`Ajustement enregistré pour ${vars.product_name || 'le produit'}`);
      queryClient.invalidateQueries({ queryKey: ['location-packaging-stock', location.id] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setDrafts(prev => {
        const copy = { ...prev };
        delete copy[vars.product_id];
        return copy;
      });
    },
    onError: (e) => toast.error(e.message || 'Erreur lors de l\'ajustement'),
  });

  const getDraft = (productId) => drafts[productId] || null;

  const setDraft = (productId, field, value) => {
    setDrafts(prev => {
      const current = prev[productId] || {
        empty_packaging_qty: '',
        empty_secondary_packaging_qty: '',
      };
      return { ...prev, [productId]: { ...current, [field]: value } };
    });
  };

  const handleConfirmOne = (item) => {
    if (!reason || !reason.trim()) {
      toast.error('Veuillez saisir une raison avant d\'ajuster.');
      return;
    }
    const draft = getDraft(item.product_id);
    if (!draft) return;
    const newBottles = draft.empty_packaging_qty === '' ? item.empty_packaging_qty : Number(draft.empty_packaging_qty);
    const newCrates = draft.empty_secondary_packaging_qty === '' ? item.empty_secondary_packaging_qty : Number(draft.empty_secondary_packaging_qty);

    if (isNaN(newBottles) || newBottles < 0 || isNaN(newCrates) || newCrates < 0) {
      toast.error('Quantités invalides.');
      return;
    }

    const sameAsBefore =
      newBottles === item.empty_packaging_qty &&
      newCrates === item.empty_secondary_packaging_qty;

    if (sameAsBefore) {
      toast.error('Aucune modification par rapport au stock actuel.');
      return;
    }

    setSubmittingProductId(item.product_id);
    adjustMut.mutate(
      {
        product_id: item.product_id,
        product_name: item.product_name,
        empty_packaging_qty: newBottles,
        empty_secondary_packaging_qty: newCrates,
        reason: reason.trim(),
      },
      { onSettled: () => setSubmittingProductId(null) }
    );
  };

  if (!location) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 bg-orange-100 rounded-xl">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div>Ajustement Emballages</div>
              <div className="text-xs font-normal text-gray-500 flex items-center gap-1 mt-0.5">
                <Warehouse className="w-3 h-3" /> {location.name}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 space-y-4 overflow-y-auto flex-1">
          {/* Error banner when API fails */}
          {queryError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                Erreur lors du chargement des emballages
              </div>
              <p className="text-xs text-red-600">
                {queryError.message || 'Le serveur a retourné une erreur inattendue.'}
              </p>
              <p className="text-[10px] text-red-500">
                Endpoint : /api/locations/{location?.id}/packaging-stock — Vérifiez que le serveur backend est actif et que SUPABASE_SERVICE_ROLE_KEY est configurée.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                className="self-start rounded-lg text-xs gap-1 border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="w-3 h-3" /> Réessayer
              </Button>
            </div>
          )}

          {/* Totaux actuels */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <div className="flex items-center gap-2 text-purple-700 text-xs font-semibold uppercase">
                <Wine className="w-4 h-4" /> Bouteilles vides
              </div>
              <div className="text-2xl font-bold text-purple-900 mt-1">{totals.empty_bottles}</div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold uppercase">
                <Boxes className="w-4 h-4" /> Cageots vides
              </div>
              <div className="text-2xl font-bold text-indigo-900 mt-1">{totals.empty_crates}</div>
            </div>
          </div>

          {/* Raison globale (obligatoire) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <Label className="text-sm font-semibold text-amber-900 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Raison de l'ajustement (obligatoire) *
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Inventaire physique du 01/06, casse vérifiée, comptage de suivi..."
              className="rounded-xl bg-white resize-none"
              rows={2}
            />
            <p className="text-xs text-amber-800">
              Cette raison sera enregistrée dans le journal d'audit pour chaque ajustement.
            </p>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un produit..."
              className="pl-10 rounded-xl"
            />
          </div>

          {/* Liste des produits avec emballages */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-medium">Aucun emballage vide à ajuster</p>
              <p className="text-xs mt-1">Aucun produit avec emballage n'a de stock vide à cet emplacement.</p>
              {data && (
                <p className="text-[10px] mt-2 text-gray-400">
                  Debug: {data.items?.length || 0} items reçus de l'API — 
                  Vérifiez que les produits ont <code>has_packaging=true</code> ou des quantités {'>'} 0.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 pb-2">
              {filteredItems.map((item) => {
                const draft = getDraft(item.product_id);
                const newBottles = draft && draft.empty_packaging_qty !== '' ? Number(draft.empty_packaging_qty) : item.empty_packaging_qty;
                const newCrates = draft && draft.empty_secondary_packaging_qty !== '' ? Number(draft.empty_secondary_packaging_qty) : item.empty_secondary_packaging_qty;
                const isDirty = !!draft;
                const isSubmitting = submittingProductId === item.product_id;
                const bottlesChanged = isDirty && Number(draft.empty_packaging_qty) !== item.empty_packaging_qty;
                const cratesChanged = isDirty && Number(draft.empty_secondary_packaging_qty) !== item.empty_secondary_packaging_qty;

                return (
                  <div
                    key={item.product_id}
                    className={`rounded-xl border p-3 transition-all ${
                      isDirty ? 'border-orange-300 bg-orange-50/30 shadow-sm' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">{item.product_name}</h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Stock plein actuel : <span className="font-medium">{item.quantity} {item.unit}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-purple-700 font-semibold uppercase flex items-center gap-1">
                          <Wine className="w-3 h-3" /> Bouteilles vides
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={draft?.empty_packaging_qty ?? item?.empty_packaging_qty ?? ''}
                            onChange={(e) => setDraft(item.product_id, 'empty_packaging_qty', e.target.value)}
                            className="rounded-lg h-9"
                          />
                          {bottlesChanged && (
                            <span className={`text-[10px] font-bold ${newBottles < item.empty_packaging_qty ? 'text-red-600' : 'text-green-600'}`}>
                              {newBottles < item.empty_packaging_qty ? '−' : '+'}
                              {Math.abs(newBottles - item.empty_packaging_qty)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500">Avant : {item.empty_packaging_qty}</p>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-indigo-700 font-semibold uppercase flex items-center gap-1">
                          <Boxes className="w-3 h-3" /> Cageots vides
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={draft?.empty_secondary_packaging_qty ?? item?.empty_secondary_packaging_qty ?? ''}
                            onChange={(e) => setDraft(item.product_id, 'empty_secondary_packaging_qty', e.target.value)}
                            className="rounded-lg h-9"
                          />
                          {cratesChanged && (
                            <span className={`text-[10px] font-bold ${newCrates < item.empty_secondary_packaging_qty ? 'text-red-600' : 'text-green-600'}`}>
                              {newCrates < item.empty_secondary_packaging_qty ? '−' : '+'}
                              {Math.abs(newCrates - item.empty_secondary_packaging_qty)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500">Avant : {item.empty_secondary_packaging_qty}</p>
                      </div>
                    </div>

                    <div className="flex justify-end mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleConfirmOne(item)}
                        disabled={!isDirty || isSubmitting || !reason.trim()}
                        className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg h-8 text-xs gap-1.5"
                      >
                        {isSubmitting ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Enregistrement...</>
                        ) : (
                          <><Save className="w-3 h-3" /> Ajuster</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
