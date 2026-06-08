import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wine, Boxes, Loader2, AlertTriangle, CheckCircle2,
  ArrowRight, Truck, ClipboardCheck, Flame, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function EmptyPackagingReceptionModal({ open, onClose, transfer }) {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState({});
  const [globalNotes, setGlobalNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const items = transfer?.stock_transfer_items || [];

  const initChecklist = () => {
    const init = {};
    for (const item of items) {
      init[item.id] = {
        received_bottles: String(item.empty_packaging_qty || 0),
        received_crates: String(item.empty_secondary_packaging_qty || 0),
        broken_bottles: '0',
        broken_crates: '0',
        note: ''
      };
    }
    setChecklist(init);
    setGlobalNotes('');
    setShowSuccess(false);
  };

  React.useEffect(() => {
    if (open && transfer) initChecklist();
  }, [open, transfer?.id]);

  const getItem = (id) =>
    checklist[id] || { received_bottles: '0', received_crates: '0', broken_bottles: '0', broken_crates: '0', note: '' };

  const setField = (id, field, value) => {
    setChecklist(prev => ({ ...prev, [id]: { ...getItem(id), [field]: value } }));
  };

  const validationErrors = useMemo(() => {
    const errors = {};
    for (const item of items) {
      const c = getItem(item.id);
      const sent_b = Number(item.empty_packaging_qty) || 0;
      const sent_c = Number(item.empty_secondary_packaging_qty) || 0;
      const recv_b = Number(c.received_bottles) || 0;
      const recv_c = Number(c.received_crates) || 0;
      const brok_b = Number(c.broken_bottles) || 0;
      const brok_c = Number(c.broken_crates) || 0;
      const msgs = [];
      if (recv_b + brok_b > sent_b)
        msgs.push(`Bouteilles : reçu(${recv_b}) + cassé(${brok_b}) > envoyé(${sent_b})`);
      if (recv_c + brok_c > sent_c)
        msgs.push(`Cageots : reçu(${recv_c}) + cassé(${brok_c}) > envoyé(${sent_c})`);
      if (recv_b < 0 || recv_c < 0 || brok_b < 0 || brok_c < 0)
        msgs.push('Les quantités doivent être ≥ 0');
      // Note obligatoire si casse déclarée
      if ((brok_b > 0 || brok_c > 0) && !c.note.trim())
        msgs.push('⚠️ Justification obligatoire quand une casse/perte est déclarée');
      if (msgs.length) errors[item.id] = msgs;
    }
    return errors;
  }, [checklist, items]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  const receiveMut = useMutation({
    mutationFn: (payload) => base44.entities.StockTransfer.receivePackaging(transfer.id, payload),
    onSuccess: (res) => {
      setLastResult(res);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['location-packaging-stock'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['pending-packaging-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Réception validée — ${res.totals?.received_bottles || 0} bouteille(s), ${res.totals?.received_crates || 0} cageot(s)`);
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la réception');
    }
  });

  const handleSubmit = () => {
    if (hasErrors || !transfer) return;
    const payload = {
      notes: globalNotes.trim() || null,
      items: items.map(item => {
        const c = getItem(item.id);
        return {
          id: item.id,
          received_bottles: Number(c.received_bottles) || 0,
          received_crates: Number(c.received_crates) || 0,
          broken_bottles: Number(c.broken_bottles) || 0,
          broken_crates: Number(c.broken_crates) || 0,
          note: c.note.trim()
        };
      })
    };
    receiveMut.mutate(payload);
  };

  if (!open || !transfer) return null;

  const fromName = transfer.from_loc?.name || 'Expéditeur';
  const toName = transfer.to_loc?.name || 'Destinataire';

  // Totaux envoyés
  const totalSentBottles = items.reduce((s, i) => s + (Number(i.empty_packaging_qty) || 0), 0);
  const totalSentCrates = items.reduce((s, i) => s + (Number(i.empty_secondary_packaging_qty) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-amber-100 bg-gradient-to-r from-amber-50/60 to-orange-50/60">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/20">
              <ClipboardCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-gray-900">Checklist de Réception</div>
              <div className="text-xs font-normal text-gray-500 mt-0.5 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                <span>{fromName}</span>
                <ArrowRight className="w-3 h-3" />
                <span>{toName}</span>
                <span className="text-amber-600 font-semibold ml-1">· {transfer.reference}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 space-y-4 overflow-y-auto flex-1 pb-2">
          <AnimatePresence mode="wait">
            {showSuccess ? (

              /* ── Succès ───────────────────────────────────────────────── */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-green-500/30">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Réception Validée !</h3>
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 w-full max-w-sm">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Bouteilles reçues</div>
                    <div className="text-2xl font-bold text-purple-700">{lastResult?.totals?.received_bottles || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Cageots reçus</div>
                    <div className="text-2xl font-bold text-indigo-700">{lastResult?.totals?.received_crates || 0}</div>
                  </div>
                </div>
                {(lastResult?.totals?.broken_bottles > 0 || lastResult?.totals?.broken_crates > 0) && (
                  <div className="text-sm text-red-700 bg-red-50 px-4 py-2 rounded-lg border border-red-200 flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    <span>
                      Casse enregistrée :&nbsp;
                      <strong>{lastResult.totals.broken_bottles} bouteille(s)</strong>,&nbsp;
                      <strong>{lastResult.totals.broken_crates} cageot(s)</strong>
                    </span>
                  </div>
                )}
                <Button onClick={onClose} className="mt-4 rounded-xl">Fermer</Button>
              </motion.div>

            ) : (

              /* ── Formulaire ────────────────────────────────────────────── */
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

                {/* Récapitulatif de l'envoi (global) */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Send className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">
                      Colis expédié par {fromName}
                    </div>
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                        <Wine className="w-4 h-4 text-purple-600" />
                        {totalSentBottles} bouteille{totalSentBottles !== 1 ? 's' : ''}
                      </span>
                      <span className="text-blue-300">·</span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                        <Boxes className="w-4 h-4 text-indigo-600" />
                        {totalSentCrates} cageot{totalSentCrates !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Alerte instructions */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Vérifiez physiquement chaque emballage. Saisissez ce que vous avez réellement reçu
                    et déclarez tout ce qui est cassé ou manquant.
                  </span>
                </div>

                {/* Liste produits */}
                <div className="space-y-4">
                  {items.map((item) => {
                    const c = getItem(item.id);
                    const errors = validationErrors[item.id] || [];
                    const sentB = Number(item.empty_packaging_qty) || 0;
                    const sentC = Number(item.empty_secondary_packaging_qty) || 0;
                    const brokB = Number(c.broken_bottles) || 0;
                    const brokC = Number(c.broken_crates) || 0;
                    const hasBreakage = brokB > 0 || brokC > 0;
                    const productName = item.product_name || item.products?.name || 'Produit inconnu';

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border-2 overflow-hidden transition-all ${
                          errors.length > 0 ? 'border-red-300' : hasBreakage ? 'border-orange-300' : 'border-gray-200'
                        }`}
                      >
                        {/* En-tête produit */}
                        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                          <h4 className="font-bold text-gray-900 text-sm">{productName}</h4>
                          <span className="text-xs text-gray-500 italic">
                            {item.product_id?.slice(0, 8)}…
                          </span>
                        </div>

                        {/* Bannière "Quantité envoyée" */}
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-2.5 flex items-center gap-6 border-b border-indigo-100">
                          <div className="flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                              Quantité envoyée :
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-sm font-bold text-purple-800">
                            <Wine className="w-3.5 h-3.5" />
                            {sentB} bouteille{sentB !== 1 ? 's' : ''}
                          </span>
                          <span className="text-indigo-300">·</span>
                          <span className="flex items-center gap-1 text-sm font-bold text-indigo-800">
                            <Boxes className="w-3.5 h-3.5" />
                            {sentC} cageot{sentC !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Champs de saisie */}
                        <div className="p-4 space-y-3 bg-white">
                          <div className="grid grid-cols-2 gap-4">

                            {/* Reçu conforme */}
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-green-700 uppercase tracking-wide flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Reçu conforme
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-[10px] text-purple-600 flex items-center gap-1 mb-1">
                                    <Wine className="w-3 h-3" /> Bouteilles
                                  </Label>
                                  <Input
                                    type="number" min="0" max={sentB}
                                    value={c.received_bottles}
                                    onChange={e => setField(item.id, 'received_bottles', e.target.value)}
                                    className="h-9 rounded-lg text-sm font-semibold border-green-200 focus:ring-green-400"
                                  />
                                  <p className="text-[10px] text-gray-400 mt-0.5">Max {sentB} envoyées</p>
                                </div>
                                <div>
                                  <Label className="text-[10px] text-indigo-600 flex items-center gap-1 mb-1">
                                    <Boxes className="w-3 h-3" /> Cageots
                                  </Label>
                                  <Input
                                    type="number" min="0" max={sentC}
                                    value={c.received_crates}
                                    onChange={e => setField(item.id, 'received_crates', e.target.value)}
                                    className="h-9 rounded-lg text-sm font-semibold border-green-200 focus:ring-green-400"
                                  />
                                  <p className="text-[10px] text-gray-400 mt-0.5">Max {sentC} envoyés</p>
                                </div>
                              </div>
                            </div>

                            {/* Cassé / Perdu */}
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-red-600 uppercase tracking-wide flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5" /> Cassé / Perdu
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-[10px] text-red-500 flex items-center gap-1 mb-1">
                                    <Wine className="w-3 h-3" /> Bouteilles
                                  </Label>
                                  <Input
                                    type="number" min="0"
                                    value={c.broken_bottles}
                                    onChange={e => setField(item.id, 'broken_bottles', e.target.value)}
                                    className="h-9 rounded-lg text-sm font-semibold border-red-200 focus:ring-red-400"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] text-red-500 flex items-center gap-1 mb-1">
                                    <Boxes className="w-3 h-3" /> Cageots
                                  </Label>
                                  <Input
                                    type="number" min="0"
                                    value={c.broken_crates}
                                    onChange={e => setField(item.id, 'broken_crates', e.target.value)}
                                    className="h-9 rounded-lg text-sm font-semibold border-red-200 focus:ring-red-400"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Note / Justification */}
                          <div>
                            <Label className={`text-[10px] uppercase tracking-wide flex items-center gap-1 mb-1 ${
                              hasBreakage ? 'text-red-600 font-bold' : 'text-gray-500'
                            }`}>
                              {hasBreakage && <AlertTriangle className="w-3 h-3" />}
                              Note / Justification{hasBreakage ? ' (obligatoire)' : ' (facultatif)'}
                            </Label>
                            <Input
                              value={c.note}
                              onChange={e => setField(item.id, 'note', e.target.value)}
                              placeholder={
                                hasBreakage
                                  ? 'Ex : chute lors du déchargement, 2 bouteilles brisées…'
                                  : 'Ex : emballage légèrement humide, RAS…'
                              }
                              className={`h-9 rounded-lg text-sm mt-0 ${
                                hasBreakage && !c.note.trim()
                                  ? 'border-red-300 bg-red-50/30 focus:ring-red-400'
                                  : ''
                              }`}
                            />
                          </div>

                          {/* Erreurs de validation */}
                          {errors.map((err, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-red-600 font-medium bg-red-50 px-2 py-1.5 rounded-lg">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Note globale */}
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-gray-700">
                    Note globale de réception (facultatif)
                  </Label>
                  <textarea
                    value={globalNotes}
                    onChange={e => setGlobalNotes(e.target.value)}
                    placeholder="Remarques générales sur la réception (état du véhicule, conditions de livraison…)"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!showSuccess && (
          <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={hasErrors || receiveMut.isPending}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl shadow-lg shadow-amber-500/20 gap-2 min-w-[200px]"
            >
              {receiveMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Validation en cours…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirmer la Réception</>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
