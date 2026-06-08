import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  MapPin, Plus, Pencil, Trash2, Warehouse, Store,
  RefreshCw, CheckCircle2, XCircle, Search, Wine, Boxes, Sliders
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import PackagingAdjustModal from '@/components/stock/PackagingAdjustModal';

const API_BASE = '/api';
const getToken = () => localStorage.getItem('auth_token');
const fetchAPI = async (endpoint, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'Request failed'); }
  return res.json();
};

const TYPES = [
  { value: 'store', label: 'Magasin', icon: Store, color: 'blue' },
  { value: 'warehouse', label: 'Entrepôt', icon: Warehouse, color: 'amber' },
];

export default function Locations() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjustingLocation, setAdjustingLocation] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'warehouse', address: '', is_active: true, username: '', pin_code: '' });

  const { data: locations = [], isLoading, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchAPI('/locations'),
  });

  const stats = useMemo(() => ({
    total: locations.length,
    stores: locations.filter(l => l.type === 'store').length,
    warehouses: locations.filter(l => l.type === 'warehouse').length,
    totalEmptyBottles: locations.reduce((s, l) => s + (Number(l.packaging_stock?.empty_bottles) || 0), 0),
    totalEmptyCrates: locations.reduce((s, l) => s + (Number(l.packaging_stock?.empty_crates) || 0), 0),
  }), [locations]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(l => l.name?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q));
  }, [locations, searchQuery]);

  const saveMut = useMutation({
    mutationFn: (data) => {
      if (editing) return fetchAPI(`/locations/${editing}`, { method: 'PUT', body: JSON.stringify(data) });
      return fetchAPI('/locations', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      closeModal();
      toast.success(editing ? 'Emplacement modifié' : 'Emplacement créé');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => fetchAPI(`/locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Emplacement supprimé');
    },
    onError: (e) => toast.error(e.message),
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', type: 'warehouse', address: '', is_active: true, username: '', pin_code: '' }); setIsModalOpen(true); };
  const openEdit = (loc) => { setEditing(loc.id); setForm({ name: loc.name, type: loc.type, address: loc.address || '', is_active: loc.is_active, username: loc.users?.[0]?.username || '', pin_code: '' }); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditing(null); };

  const handleDelete = (id, name) => {
    toast('Confirmer la suppression', {
      description: `Supprimer l'emplacement "${name}" ?`,
      action: { label: 'Supprimer', onClick: () => deleteMut.mutate(id) },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <MapPin className="w-7 h-7 text-indigo-600" />
              Gestion des Emplacements
            </h1>
            <p className="text-gray-500">Magasins et entrepôts de votre réseau</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl bg-white shadow-sm hover:shadow-md gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
            <Button onClick={openAdd} className="bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white rounded-xl shadow-lg shadow-indigo-500/30">
              <Plus className="w-5 h-5 mr-2" /> Nouvel Emplacement
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div><p className="text-sm font-medium text-gray-500 mb-1">Total</p><h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3></div>
                  <div className="p-3 bg-indigo-100 rounded-xl"><MapPin className="w-6 h-6 text-indigo-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div><p className="text-sm font-medium text-gray-500 mb-1">Magasins</p><h3 className="text-2xl font-bold text-blue-600">{stats.stores}</h3></div>
                  <div className="p-3 bg-blue-100 rounded-xl"><Store className="w-6 h-6 text-blue-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div><p className="text-sm font-medium text-gray-500 mb-1">Entrepôts</p><h3 className="text-2xl font-bold text-amber-600">{stats.warehouses}</h3></div>
                  <div className="p-3 bg-amber-100 rounded-xl"><Warehouse className="w-6 h-6 text-amber-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div><p className="text-sm font-medium text-gray-500 mb-1">Bouteilles vides</p><h3 className="text-2xl font-bold text-purple-600">{stats.totalEmptyBottles}</h3></div>
                  <div className="p-3 bg-purple-100 rounded-xl"><Wine className="w-6 h-6 text-purple-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div><p className="text-sm font-medium text-gray-500 mb-1">Cageots vides</p><h3 className="text-2xl font-bold text-indigo-600">{stats.totalEmptyCrates}</h3></div>
                  <div className="p-3 bg-indigo-100 rounded-xl"><Boxes className="w-6 h-6 text-indigo-600" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un emplacement..." className="pl-10 rounded-xl bg-white border-gray-200" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="py-4">Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Compte</TableHead>
                  <TableHead>Emballages vides</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => <TableRow key={i}><TableCell colSpan={7} className="h-16 animate-pulse bg-gray-50" /></TableRow>)
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-500">Aucun emplacement</TableCell></TableRow>
                ) : (
                  filtered.map(loc => {
                    const t = TYPES.find(tt => tt.value === loc.type);
                    const packaging = loc.packaging_stock || { empty_bottles: 0, empty_crates: 0 };
                    const hasPackaging = packaging.empty_bottles > 0 || packaging.empty_crates > 0;
                    return (
                      <TableRow key={loc.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-gray-900">{loc.name}</TableCell>
                        <TableCell>
                          <Badge className={`${t?.color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'} border-0`}>
                            {t?.label || loc.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">{loc.address || '—'}</TableCell>
                        <TableCell>
                          {loc.users?.[0]?.username ? (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md font-medium">@{loc.users[0].username}</span>
                          ) : (
                            <span className="text-gray-400 text-sm italic">Aucun</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasPackaging ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-100">
                                <Wine className="w-3 h-3" /> {packaging.empty_bottles}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
                                <Boxes className="w-3 h-3" /> {packaging.empty_crates}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm italic">Aucun</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {loc.is_active !== false
                            ? <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Actif</span>
                            : <span className="flex items-center gap-1 text-gray-400 text-sm font-medium"><XCircle className="w-4 h-4" /> Inactif</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAdjustingLocation(loc)}
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg gap-1 px-2 h-8"
                              title="Ajuster les stocks d'emballages"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">Emballages</span>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(loc)} className="text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(loc.id, loc.name)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Add/Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader><DialogTitle>{editing ? 'Modifier l\'emplacement' : 'Nouvel emplacement'}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Entrepôt Central" required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value })}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-all border ${form.type === t.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <t.icon className="w-5 h-5" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Optionnel..." />
              </div>
              
              <div className="pt-4 mt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Accès au système</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Identifiant (Optionnel)</Label>
                    <Input 
                      value={form.username} 
                      onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })} 
                      placeholder="Ex: entrepot3" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Code PIN {editing && form.username ? '(Optionnel)' : form.username ? '*' : ''}</Label>
                    <Input 
                      type="password"
                      value={form.pin_code} 
                      onChange={e => setForm({ ...form, pin_code: e.target.value.replace(/\D/g, '') })} 
                      placeholder={editing && form.username ? 'Laisser vide pour ne pas changer' : 'ex: 1234'}
                      maxLength={4}
                      required={!!form.username && !editing}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Si vous renseignez ces champs, un compte sera automatiquement lié à cet emplacement.
                </p>
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={closeModal}>Annuler</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Sauvegarde...' : editing ? 'Modifier' : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal d'ajustement des emballages */}
        <PackagingAdjustModal
          open={!!adjustingLocation}
          onClose={() => setAdjustingLocation(null)}
          location={adjustingLocation}
        />
      </div>
    </div>
  );
}
