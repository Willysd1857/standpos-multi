import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Save, Upload, X, Edit, ToggleLeft } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function BusinessSettings() {
  const { getCurrencySymbol, convertAmount, convertToAriary } = useCurrency();
  const [formData, setFormData] = useState({
    business_name: '',
    business_address: '',
    business_phone: '',
    business_email: '',
    nif: '',
    stat: '',
    business_logo: '',
    receipt_footer: '',
    vip_charge: '',
    timezone: '',
    currency: 'MGA',
    exchange_rate_usd: '4500',
    exchange_rate_eur: '5000',
    enable_tables: true,
    enable_ingredient_usage: true,
    packaging_due_days: 30
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get()
  });

  useEffect(() => {
    if (settings && (!isEditMode || !isInitialized)) {
      // Convert stored Ariary VIP charge to current display currency
      const displayVipCharge = settings.vip_charge
        ? convertAmount(settings.vip_charge, settings.currency)
        : '';

      setFormData({
        business_name: settings.business_name || '',
        business_address: settings.business_address || '',
        business_phone: settings.business_phone || '',
        business_email: settings.business_email || '',
        nif: settings.nif || '',
        stat: settings.stat || '',
        business_logo: settings.business_logo || '',
        receipt_footer: settings.receipt_footer || '',
        vip_charge: displayVipCharge.toString(),
        timezone: settings.timezone || '',
        currency: settings.currency || 'MGA',
        exchange_rate_usd: settings.exchange_rate_usd?.toString() || '4500',
        exchange_rate_eur: settings.exchange_rate_eur?.toString() || '5000',
        enable_tables: settings.enable_tables !== undefined ? Boolean(settings.enable_tables) : true,
        enable_ingredient_usage: settings.enable_ingredient_usage !== undefined ? Boolean(settings.enable_ingredient_usage) : true,
        packaging_due_days: settings.packaging_due_days || 30
      });
      setIsInitialized(true);
    }
  }, [settings, convertAmount, isEditMode, isInitialized]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Settings.update(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      // Convert the displayed VIP charge back to Ariary for storage
      const ariaryVipCharge = convertToAriary(Number(formData.vip_charge), formData.currency);

      const dataToSave = {
        ...formData,
        vip_charge: ariaryVipCharge,
        enable_tables: formData.enable_tables ? 1 : 0,
        enable_ingredient_usage: formData.enable_ingredient_usage ? 1 : 0
      };

      await saveMutation.mutateAsync(dataToSave);
      setIsEditMode(false); // Switch to view mode after saving
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde des paramètres. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, business_logo: result.file_url });
    } catch (error) {
      console.error('Erreur upload:', error);
      toast.error('Erreur lors du téléchargement du logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-amber-50">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Store className="w-6 h-6 text-orange-500" />
            Information principal
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Ces informations apparaîtront sur vos factures
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Logo */}
            <div>
              <Label className="text-sm font-semibold text-gray-700">Logo</Label>
              <div className="mt-2 space-y-3">
                {formData.business_logo && (
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-100 border-2 border-gray-200">
                    <img
                      src={formData.business_logo}
                      alt="Logo"
                      className="w-full h-full object-contain p-2"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, business_logo: '' })}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <label className="cursor-pointer inline-block">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-colors">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-600">
                      {uploadingLogo ? 'Upload en cours...' : 'Télécharger un logo'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business name */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">
                  Nom de la Boutique *
                </Label>
                <Input
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  placeholder="Ex: Boutique"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  required
                  disabled={!isEditMode}
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">Adresse</Label>
                <Input
                  value={formData.business_address}
                  onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                  placeholder="Ex: 123 Rue de la République, Antananarivo"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* Phone */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Téléphone</Label>
                <Input
                  value={formData.business_phone}
                  onChange={(e) => setFormData({ ...formData, business_phone: e.target.value })}
                  placeholder="Ex: 034 12 345 67"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* Email */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Email</Label>
                <Input
                  type="email"
                  value={formData.business_email}
                  onChange={(e) => setFormData({ ...formData, business_email: e.target.value })}
                  placeholder="Ex: contact@standpos.mg"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* NIF */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">
                  NIF
                  <span className="text-xs text-gray-500 ml-2">(Numéro d'Identification Fiscale)</span>
                </Label>
                <Input
                  value={formData.nif}
                  onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                  placeholder="Ex: 1234567890123"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* STAT */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">
                  STAT
                  <span className="text-xs text-gray-500 ml-2">(Numéro Statistique)</span>
                </Label>
                <Input
                  value={formData.stat}
                  onChange={(e) => setFormData({ ...formData, stat: e.target.value })}
                  placeholder="Ex: 12345678901234"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* VIP Charge */}
              {formData.enable_tables && (
                <div className="md:col-span-2">
                  <Label className="text-sm font-semibold text-gray-700">
                    Frais Table VIP ({getCurrencySymbol()})
                    <span className="text-xs text-gray-500 ml-2">(Montant ajouté automatiquement)</span>
                  </Label>
                  <Input
                    type="number"
                    value={formData.vip_charge}
                    onChange={(e) => setFormData({ ...formData, vip_charge: e.target.value })}
                    placeholder="Ex: 5000"
                    className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                    disabled={!isEditMode}
                  />
                </div>
              )}

              {/* Timezone */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">
                  Fuseau horaire
                  <span className="text-xs text-gray-500 ml-2">(Pour l'affichage des dates)</span>
                </Label>
                <Input
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  placeholder="Ex: Indian/Antananarivo"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exemples: "Indian/Antananarivo" (Madagascar), "Europe/Paris", "UTC".
                </p>
              </div>

              {/* Currency Selection */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">
                  Devise
                  <span className="text-xs text-gray-500 ml-2">(Devise d'affichage)</span>
                </Label>
                <select
                  value={formData.currency}
                  onChange={(e) => {
                    const newCurrency = e.target.value;
                    const oldCurrency = formData.currency;

                    // Convert the VIP charge value when switching currency
                    let newVipCharge = formData.vip_charge;
                    if (formData.vip_charge) {
                      const inAriary = convertToAriary(Number(formData.vip_charge), oldCurrency);
                      newVipCharge = convertAmount(inAriary, newCurrency).toString();
                    }

                    setFormData({
                      ...formData,
                      currency: newCurrency,
                      vip_charge: newVipCharge
                    });
                  }}
                  className="mt-2 w-full rounded-xl border-2 border-gray-300 focus:border-orange-500 focus:ring-orange-500 px-3 py-2 bg-white"
                  disabled={!isEditMode}
                >
                  <option value="MGA">Ariary (Ar)</option>
                  <option value="USD">Dollar américain ($)</option>
                  <option value="EUR">Euro (€)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Les prix sont stockés en Ariary et convertis selon les taux de change ci-dessous.
                </p>
              </div>

              {/* Exchange Rates */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">
                  Taux USD → Ariary
                  <span className="text-xs text-gray-500 ml-2">(1 USD = ? Ar)</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.exchange_rate_usd}
                  onChange={(e) => setFormData({ ...formData, exchange_rate_usd: e.target.value })}
                  placeholder="Ex: 4500"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700">
                  Taux EUR → Ariary
                  <span className="text-xs text-gray-500 ml-2">(1 EUR = ? Ar)</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.exchange_rate_eur}
                  onChange={(e) => setFormData({ ...formData, exchange_rate_eur: e.target.value })}
                  placeholder="Ex: 5000"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>

              {/* Receipt footer */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">
                  Message de pied de page
                  <span className="text-xs text-gray-500 ml-2">(sur la facture)</span>
                </Label>
                <Textarea
                  value={formData.receipt_footer}
                  onChange={(e) => setFormData({ ...formData, receipt_footer: e.target.value })}
                  placeholder="Ex: Merci de votre visite ! À bientôt"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500 resize-none"
                  rows={3}
                  disabled={!isEditMode}
                />
              </div>

              {/* Délai de retard des consignes */}
              <div className="md:col-span-2">
                <Label className="text-sm font-semibold text-gray-700">
                  Délai de retard des consignes (jours)
                  <span className="text-xs text-gray-500 ml-2">(Nombre de jours avant qu'un emballage soit en retard)</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.packaging_due_days}
                  onChange={(e) => setFormData({ ...formData, packaging_due_days: Number(e.target.value) })}
                  placeholder="Ex: 30"
                  className="mt-2 rounded-xl border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                  disabled={!isEditMode}
                />
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="md:col-span-2 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <ToggleLeft className="w-4 h-4 text-gray-500" />
                Fonctionnalités
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Gestion des tables</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Activer la sélection de tables, numéros de tables et informations de table dans les commandes
                    </p>
                  </div>
                  <Switch
                    checked={formData.enable_tables}
                    onCheckedChange={(checked) => setFormData({ ...formData, enable_tables: checked })}
                    disabled={!isEditMode}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              {!isEditMode && (
                <Button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-8 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl shadow-lg shadow-blue-500/30"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}
              {isEditMode && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditMode(false);
                      setIsInitialized(false); // Force reload from database
                    }}
                    disabled={isProcessing}
                    className="px-8 rounded-xl border-gray-300 hover:bg-gray-50"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={isProcessing || !formData.business_name}
                    className="px-8 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-lg shadow-orange-500/30"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isProcessing ? 'Enregistrement...' : 'Enregistrer tout'}
                  </Button>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}