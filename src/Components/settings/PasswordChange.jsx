import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PasswordChange = () => {
    const { token, user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        if (newPassword.length < 6) {
            setError('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('http://localhost:3002/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            if (response.ok) {
                toast.success('Mot de passe modifié avec succès');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                const error = await response.json();
                setError(error.error || 'Erreur lors de la modification');
            }
        } catch (error) {
            setError('Erreur lors de la modification du mot de passe');
        } finally {
            setLoading(false);
        }
    };

    const getPasswordStrength = (password) => {
        if (password.length === 0) return { strength: 0, label: '', color: '' };
        if (password.length < 6) return { strength: 1, label: 'Faible', color: 'bg-red-500' };
        if (password.length < 10) return { strength: 2, label: 'Moyen', color: 'bg-yellow-500' };
        return { strength: 3, label: 'Fort', color: 'bg-green-500' };
    };

    const passwordStrength = getPasswordStrength(newPassword);

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Changer le mot de passe
                </CardTitle>
                <CardDescription>
                    Modifiez votre mot de passe pour sécuriser votre compte
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="current">Mot de passe actuel</Label>
                        <Input
                            id="current"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new">Nouveau mot de passe</Label>
                        <Input
                            id="new"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                        {newPassword && (
                            <div className="space-y-1">
                                <div className="flex gap-1">
                                    {[1, 2, 3].map((level) => (
                                        <div
                                            key={level}
                                            className={`h-2 flex-1 rounded ${level <= passwordStrength.strength
                                                ? passwordStrength.color
                                                : 'bg-gray-200'
                                                }`}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm text-gray-600">
                                    Force: {passwordStrength.label}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-purple-600 hover:bg-purple-700"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Modification...
                            </>
                        ) : (
                            'Modifier le mot de passe'
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

export default PasswordChange;
