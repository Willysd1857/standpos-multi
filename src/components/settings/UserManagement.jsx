import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2, Power, PowerOff, Loader2, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const UserManagement = () => {
    const { token } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [newUser, setNewUser] = useState({
        email: '',
        password: '',
        full_name: '',
        role: 'user'
    });

    const fetchUsers = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            toast.error('Erreur lors du chargement des utilisateurs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [token]);

    const handleAddUser = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newUser)
            });

            if (response.ok) {
                toast.success('Utilisateur créé avec succès');
                setShowAddDialog(false);
                setNewUser({ email: '', password: '', full_name: '', role: 'user' });
                fetchUsers();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors de la création');
            }
        } catch (error) {
            toast.error('Erreur lors de la création de l\'utilisateur');
        }
    };

    const handleDeleteUser = async (userId) => {
        toast('Êtes-vous sûr de vouloir supprimer cet utilisateur?', {
            action: {
                label: 'Supprimer',
                onClick: async () => {
                    try {
                        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${userId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (response.ok) {
                            toast.success('Utilisateur supprimé');
                            fetchUsers();
                        } else {
                            const error = await response.json();
                            toast.error(error.error || 'Erreur lors de la suppression');
                        }
                    } catch (error) {
                        toast.error('Erreur lors de la suppression');
                    }
                }
            }
        });
    };

    const handleToggleActive = async (userId, currentStatus) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${userId}/activate`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_active: currentStatus ? 0 : 1 })
            });

            if (response.ok) {
                toast.success(currentStatus ? 'Utilisateur désactivé' : 'Utilisateur activé');
                fetchUsers();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur');
            }
        } catch (error) {
            toast.error('Erreur lors de la modification');
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            toast.error('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: selectedUser.id,
                    newPassword: newPassword,
                    adminOverride: true
                })
            });

            if (response.ok) {
                toast.success('Mot de passe réinitialisé avec succès');
                setShowPasswordDialog(false);
                setNewPassword('');
                setSelectedUser(null);
                setShowPassword(false);
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors de la réinitialisation');
            }
        } catch (error) {
            toast.error('Erreur lors de la réinitialisation du mot de passe');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Gestion des Utilisateurs</h2>
                <Button onClick={() => setShowAddDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Ajouter un utilisateur
                </Button>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Nom complet</TableHead>
                        <TableHead>Rôle</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date de création</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email || user.username}</TableCell>
                            <TableCell>{user.full_name}</TableCell>
                            <TableCell>
                                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                    {user.role === 'admin' ? 'Admin' : 'Utilisateur'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={user.is_active ? 'success' : 'destructive'}>
                                    {user.is_active ? 'Actif' : 'Inactif'}
                                </Badge>
                            </TableCell>
                            <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSelectedUser(user);
                                        setShowPasswordDialog(true);
                                    }}
                                    title="Réinitialiser le mot de passe"
                                >
                                    <Key className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleToggleActive(user.id, user.is_active)}
                                >
                                    {user.is_active ? (
                                        <PowerOff className="h-4 w-4" />
                                    ) : (
                                        <Power className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteUser(user.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajouter un utilisateur</DialogTitle>
                        <DialogDescription>
                            Créer un nouveau compte utilisateur
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="email">Adresse Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={newUser.email}
                                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="full_name">Nom complet</Label>
                            <Input
                                id="full_name"
                                value={newUser.full_name}
                                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="password">Mot de passe</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="role">Rôle</Label>
                            <select
                                id="role"
                                className="w-full border rounded-md p-2"
                                value={newUser.role}
                                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                            >
                                <option value="user">Utilisateur</option>
                                <option value="admin">Administrateur</option>
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Annuler
                        </Button>
                        <Button onClick={handleAddUser} className="bg-purple-600 hover:bg-purple-700">
                            Créer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Password Reset Dialog */}
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                        <DialogDescription>
                            Définir un nouveau mot de passe pour {selectedUser?.username}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="new_password">Nouveau mot de passe</Label>
                            <div className="relative">
                                <Input
                                    id="new_password"
                                    type={showPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimum 6 caractères"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                L'utilisateur devra utiliser ce nouveau mot de passe pour se connecter
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowPasswordDialog(false);
                            setNewPassword('');
                            setSelectedUser(null);
                            setShowPassword(false);
                        }}>
                            Annuler
                        </Button>
                        <Button onClick={handleResetPassword} className="bg-purple-600 hover:bg-purple-700">
                            Réinitialiser
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default UserManagement;
