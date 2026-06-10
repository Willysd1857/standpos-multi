import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, MapPin, Truck, CreditCard, Calendar, AlertCircle, Wine, Boxes, Wallet, FileText, RefreshCw, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { toast } from 'sonner';

export default function CheckoutModal({ open, onClose, items, onConfirm, isLoading }) {
    const { formatCurrency } = useCurrency();
    const { isAdmin, user } = useAuth();

    // Fetch all locations. We query unconditionally (not gated on `open`) so the
    // data is already cached in React Query by the time the admin opens the
    // modal — avoids an empty Select on first open.
    const {
        data: locations = [],
        isLoading: locationsLoading,
        error: locationsError,
        refetch: refetchLocations
    } = useQuery({
        queryKey: ['locations'],
        queryFn: async () => {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('Non authentifié — token manquant. Reconnectez-vous.');
            }
            const res = await fetch('/api/locations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Erreur ${res.status} lors du chargement des emplacements`);
            }
            const data = await res.json();
            return (Array.isArray(data) ? data : []).sort((a, b) => {
                if (a.type === 'store' && b.type !== 'store') return -1;
                if (a.type !== 'store' && b.type === 'store') return 1;
                return a.name.localeCompare(b.name);
            });
        },
        staleTime: 60_000,
        retry: 1
    });

    // Fetch suppliers (active only by default) — uses proven direct fetch pattern + shared query key with Suppliers page
    const { data: suppliers = [], isLoading: loadingSuppliers, error: suppliersError, refetch: refetchSuppliers, isFetched: suppliersFetched } = useQuery({
        queryKey: ['suppliers'],
        queryFn: async () => {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/suppliers', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Erreur ${res.status} lors du chargement des fournisseurs`);
            }
            const list = await res.json();
            return Array.isArray(list) ? list.filter(s => s && s.id) : [];
        },
        enabled: open,
        staleTime: 0,
        refetchOnMount: 'always',
        retry: 2
    });

    // Force a fresh refetch every time the modal opens to ensure data is up-to-date
    useEffect(() => {
        if (open) {
            console.log('[CheckoutModal] Modal opened, refetching suppliers...');
            refetchSuppliers();
        }
    }, [open, refetchSuppliers]);

    // Active suppliers only for the dropdown (but keep all in cache)
    const activeSuppliers = useMemo(
        () => suppliers.filter(s => s.is_active !== false),
        [suppliers]
    );

    const [formData, setFormData] = useState({
        supplier_id: '',
        supplier_name: '',
        payment_type: 'cash', // 'cash' | 'credit' | 'partial'
        payment_method: 'cash',
        paid_amount: 0,
        due_date: '',
        date: new Date().toISOString().split('T')[0],
        status: 'validated',
        notes: '',
        location_id: '',
        returned_bottles: 0,
        returned_crates: 0
    });

    // Auto-detect if any item in the order has packaging
    const hasPackagingItems = useMemo(() => {
        return (items || []).some(item => item.has_packaging);
    }, [items]);

    // Auto-set location_id for non-admins only (they always receive at their
    // own location, no choice) OR if the order contains packaging items (forces 'loc-wh-1').
    // Admins MUST explicitly pick a destination every time — never pre-select for them, unless packaging items are present.
    useEffect(() => {
        if (open) {
            if (hasPackagingItems) {
                setFormData(prev => ({ ...prev, location_id: 'loc-wh-1' }));
            } else if (!isAdmin() && user?.location_id) {
                setFormData(prev => ({ ...prev, location_id: user.location_id }));
            }
        }
    }, [isAdmin, user, open, hasPackagingItems]);

    // Reset the admin's destination when the modal re-opens (unless packaging items force Entrepôt 1), so they always
    // make a fresh, conscious choice. (Without this, an admin who picked
    // "Entrepôt 1" on the previous order would silently get "Entrepôt 1" again.)
    useEffect(() => {
        if (open && isAdmin() && !hasPackagingItems) {
            setFormData(prev => ({ ...prev, location_id: '' }));
        }
    }, [open, isAdmin, hasPackagingItems]);

    // When a supplier is selected, auto-fill supplier_name and outstanding balances
    const selectedSupplier = useMemo(
        () => suppliers.find(s => s.id === formData.supplier_id) || null,
        [suppliers, formData.supplier_id]
    );

    const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Compute debt based on payment_type
    useEffect(() => {
        setFormData(prev => {
            let paid = prev.paid_amount;
            if (prev.payment_type === 'cash') paid = total;
            else if (prev.payment_type === 'credit') paid = 0;
            // 'partial' = keep current paid_amount
            return { ...prev, paid_amount: paid };
        });
    }, [formData.payment_type, total]);

    const debt_amount = Math.max(0, total - (Number(formData.paid_amount) || 0));

    const handleSupplierChange = (val) => {
        const supplier = suppliers.find(s => s.id === val);
        setFormData(prev => ({
            ...prev,
            supplier_id: val,
            supplier_name: supplier?.name || ''
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.supplier_id) {
            toast.error('Veuillez sélectionner un fournisseur');
            return;
        }
        if (isAdmin() && !formData.location_id) {
            toast.error('Veuillez choisir une destination pour le stock');
            return;
        }
        if ((formData.payment_type === 'credit' || formData.payment_type === 'partial') && !formData.due_date) {
            toast.error('Veuillez saisir une date d\'échéance');
            return;
        }
        if (formData.payment_type === 'partial' && (!formData.paid_amount || formData.paid_amount <= 0)) {
            toast.error('Veuillez saisir un montant versé supérieur à 0');
            return;
        }
        if (formData.payment_type === 'partial' && formData.paid_amount >= total) {
            toast.error('Pour un paiement comptant, sélectionnez "Comptant"');
            return;
        }
        onConfirm({
            ...formData,
            paid_amount: Number(formData.paid_amount) || 0,
            returned_bottles: Number(formData.returned_bottles) || 0,
            returned_crates: Number(formData.returned_crates) || 0,
            items
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-green-600" />
                        Finaliser l'approvisionnement
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* Items summary */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Récapitulatif ({items.length} produit{items.length > 1 ? 's' : ''})
                        </h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                            {items.map((item) => (
                                <div key={item.product_id} className="flex justify-between text-sm bg-white/60 rounded-lg px-3 py-2">
                                    <span className="font-medium text-gray-900">
                                        {item.product_name} <span className="text-gray-500">x{item.quantity} {item.unit || ''}</span>
                                    </span>
                                    <span className="font-semibold text-green-600">
                                        {formatCurrency(item.quantity * item.unit_price)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                            <span className="font-semibold text-gray-700">Total</span>
                            <span className="text-xl font-bold text-green-600">{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Destination (Location) — using a native <select> for
                        maximum reliability inside a Radix Dialog. Radix Select
                        (portal-based) was dropping its items when nested in
                        DialogContent, so we switch to a plain HTML <select>. */}
                    {isAdmin() ? (
                        hasPackagingItems ? (
                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
                                <Truck className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-amber-900">Destination verrouillée — Entrepôt 1</p>
                                    <p className="text-xs text-amber-700 mt-1">
                                        Cette commande contient des produits consignés (avec emballage).
                                        Elle sera obligatoirement réceptionnée à l'Entrepôt 1, puis transitera vers l'Entrepôt 2 avant de rejoindre le Magasin.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="location_id" className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" /> Destination du stock *
                                </Label>
                                {locationsError ? (
                                    <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg space-y-2">
                                        <p className="font-semibold">⚠ Erreur de chargement des emplacements</p>
                                        <p className="text-xs">{locationsError.message}</p>
                                        <button
                                            type="button"
                                            onClick={() => refetchLocations()}
                                            className="text-xs underline hover:no-underline"
                                        >
                                            Réessayer
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <select
                                                id="location_id"
                                                data-testid="destination-select"
                                                value={formData.location_id || ''}
                                                onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                                                disabled={locationsLoading}
                                                className={
                                                    "flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer pr-8 " +
                                                    (formData.location_id
                                                        ? 'border-gray-300'
                                                        : 'border-amber-400 bg-amber-50 text-amber-700')
                                                }
                                            >
                                                <option value="">
                                                    {locationsLoading ? '⏳ Chargement...' : '— Choisir la destination —'}
                                                </option>
                                                {locations.map(loc => (
                                                    <option
                                                        key={loc.id}
                                                        value={loc.id}
                                                        data-testid={`destination-option-${loc.id}`}
                                                    >
                                                        {loc.type === 'store' ? 'Magasin' : 'Entrepôt'} — {loc.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
                                        </div>
                                        {!formData.location_id && !locationsLoading && locations.length > 0 && (
                                            <p className="text-[11px] text-amber-600">⚠ Veuillez choisir une destination pour le stock.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="bg-gray-50 p-3 rounded-lg flex items-center gap-2 border border-gray-100 text-sm text-gray-600">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {hasPackagingItems ? (
                                <span>Stock destiné à l'Entrepôt 1 (obligatoire pour emballages)</span>
                            ) : (
                                <span>Stock destiné à votre emplacement actuel</span>
                            )}
                        </div>
                    )}

                    {/* Supplier - Native HTML select for reliability inside dialog */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="supplier_id" className="flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" /> Fournisseur *
                            </Label>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500">
                                    {suppliersFetched && !loadingSuppliers && (
                                        <span>
                                            {activeSuppliers.length} actif{suppliers.length !== activeSuppliers.length && ` / ${suppliers.length} total`}
                                        </span>
                                    )}
                                    {loadingSuppliers && 'Chargement...'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => refetchSuppliers()}
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                    title="Recharger la liste des fournisseurs"
                                >
                                    <RefreshCw className={`w-3 h-3 ${loadingSuppliers ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Native HTML select - bypasses Radix UI issues with portals in dialogs */}
                        {activeSuppliers.length > 0 ? (
                            <div className="relative">
                                <select
                                    id="supplier_id"
                                    value={formData.supplier_id}
                                    onChange={(e) => handleSupplierChange(e.target.value)}
                                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
                                    required
                                >
                                    <option value="">-- Sélectionner un fournisseur --</option>
                                    {activeSuppliers.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                            {(Number(s.total_debt) || 0) > 0 && ` (dette: ${formatCurrency(s.total_debt)})`}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
                            </div>
                        ) : (
                            <div className="p-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                                {loadingSuppliers ? (
                                    <div>⏳ Chargement des fournisseurs...</div>
                                ) : suppliersError ? (
                                    <>
                                        <div className="text-red-600 font-semibold">❌ Erreur de chargement</div>
                                        <div className="text-xs text-gray-500">{suppliersError.message || 'Erreur inconnue'}</div>
                                        <button
                                            type="button"
                                            onClick={() => refetchSuppliers()}
                                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Réessayer
                                        </button>
                                    </>
                                ) : suppliers.length > 0 ? (
                                    <>
                                        <div className="text-amber-700 font-semibold">⚠️ {suppliers.length} fournisseur(s) chargé(s) mais tous désactivés</div>
                                        <div className="text-xs text-gray-500">Activez-les dans l'onglet Fournisseurs.</div>
                                        <select
                                            value={formData.supplier_id}
                                            onChange={(e) => handleSupplierChange(e.target.value)}
                                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
                                        >
                                            <option value="">-- (tous désactivés) --</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} (désactivé)
                                                </option>
                                            ))}
                                        </select>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-amber-700 font-semibold">⚠️ Aucun fournisseur enregistré</div>
                                        <div className="text-xs text-gray-500">Créez-en un dans l'onglet Fournisseurs avant de finaliser un approvisionnement.</div>
                                        <button
                                            type="button"
                                            onClick={() => { onClose(); window.location.hash = '#/suppliers'; }}
                                            className="mt-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 inline-flex items-center gap-1"
                                        >
                                            <Truck className="w-3 h-3" /> Ouvrir l'onglet Fournisseurs
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {suppliersError && (
                            <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                                <strong>Erreur de chargement :</strong> {suppliersError.message || 'Erreur inconnue'}
                                <br />
                                <span className="text-red-500">Vérifiez que vous êtes connecté et réessayez.</span>
                            </div>
                        )}
                        {selectedSupplier && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-600 flex items-center justify-between">
                                <span>Emballages à rendre :</span>
                                <span className="font-semibold">
                                    {selectedSupplier.outstanding_bottles || 0} bout. · {selectedSupplier.outstanding_crates || 0} cag.
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Payment Type */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5" /> Mode de paiement *
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'cash', label: 'Comptant', icon: Wallet },
                                { id: 'partial', label: 'Partiel', icon: CreditCard },
                                { id: 'credit', label: 'À crédit', icon: Calendar }
                            ].map(opt => {
                                const Icon = opt.icon;
                                const active = formData.payment_type === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, payment_type: opt.id })}
                                        className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all ${
                                            active
                                                ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="text-xs font-semibold">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Amount paid + Payment method */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="paid_amount">Montant versé</Label>
                            <Input
                                id="paid_amount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.paid_amount}
                                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value, payment_type: 'partial' })}
                                disabled={formData.payment_type === 'cash' || formData.payment_type === 'credit'}
                                className="rounded-xl border-gray-300"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment_method">Méthode</Label>
                            <Select
                                value={formData.payment_method}
                                onValueChange={(val) => setFormData({ ...formData, payment_method: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Espèces</SelectItem>
                                    <SelectItem value="mvola">MVola</SelectItem>
                                    <SelectItem value="orange_money">Orange Money</SelectItem>
                                    <SelectItem value="airtel_money">Airtel Money</SelectItem>
                                    <SelectItem value="visa">Virement / Carte</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Due date (only for credit/partial) */}
                    {(formData.payment_type === 'credit' || formData.payment_type === 'partial') && (
                        <div className="space-y-2">
                            <Label htmlFor="due_date" className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> Date d'échéance *
                            </Label>
                            <Input
                                id="due_date"
                                type="date"
                                value={formData.due_date}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                className="rounded-xl border-gray-300"
                                required
                            />
                        </div>
                    )}

                    {/* Debt summary */}
                    {debt_amount > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-orange-800">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-sm font-semibold">Reste à payer (dette fournisseur)</span>
                            </div>
                            <span className="text-lg font-bold text-orange-700">{formatCurrency(debt_amount)}</span>
                        </div>
                    )}

                    {/* Packaging returns */}
                    <div className="space-y-2 bg-purple-50/40 border border-purple-100 rounded-xl p-3">
                        <Label className="flex items-center gap-1 text-purple-900">
                            <Package className="w-3.5 h-3.5" /> Emballages rendus au fournisseur
                            <span className="text-xs font-normal text-gray-500">(optionnel)</span>
                        </Label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="returned_bottles" className="text-xs text-purple-700 flex items-center gap-1">
                                    <Wine className="w-3 h-3" /> Bouteilles
                                </Label>
                                <Input
                                    id="returned_bottles"
                                    type="number"
                                    min="0"
                                    value={formData.returned_bottles}
                                    onChange={(e) => setFormData({ ...formData, returned_bottles: e.target.value })}
                                    className="rounded-xl border-purple-200"
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="returned_crates" className="text-xs text-purple-700 flex items-center gap-1">
                                    <Boxes className="w-3 h-3" /> Cageots
                                </Label>
                                <Input
                                    id="returned_crates"
                                    type="number"
                                    min="0"
                                    value={formData.returned_crates}
                                    onChange={(e) => setFormData({ ...formData, returned_crates: e.target.value })}
                                    className="rounded-xl border-purple-200"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-purple-600 italic">
                            Le stock d'emballages vides et le solde à rendre au fournisseur seront mis à jour.
                        </p>
                    </div>

                    {/* Date + Notes */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes" className="flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" /> Notes
                            </Label>
                            <Input
                                id="notes"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Notes..."
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Enregistrement...' : 'Valider l\'approvisionnement'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
