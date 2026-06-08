import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, User, Delete, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const NUMPAD_KEYS = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'C', '0', 'DEL'
];

const Login = () => {
    const [username, setUsername] = useState('admin');
    const [usersList, setUsersList] = useState([]);
    const [pinCode, setPinCode] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await fetch('/api/users/public/list');
                if (res.ok) {
                    const data = await res.json();
                    setUsersList(data);
                    if (data.length > 0) {
                        setUsername(data[0].username);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch users list", error);
            }
        };
        fetchUsers();
    }, []);

    const handleNumpadClick = (key) => {
        setError('');
        if (key === 'C') {
            setPinCode('');
        } else if (key === 'DEL') {
            setPinCode((prev) => prev.slice(0, -1));
        } else {
            if (pinCode.length < 8) { // Maximum 8 digits
                setPinCode((prev) => prev + key);
            }
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!username || !pinCode) {
            setError('Veuillez entrer votre identifiant et votre code PIN.');
            return;
        }

        setError('');
        setLoading(true);

        const result = await login(username, pinCode);

        if (result.success) {
            navigate('/dashboard');
        } else {
            setError(result.error || 'Connexion échouée');
            setPinCode(''); // Reset PIN on failure
        }

        setLoading(false);
    };

    // Support physical keyboard
    const handleKeyDown = (e) => {
        // If the user is typing directly inside an input, let the input handle it natively
        if (e.target.tagName === 'INPUT') return;

        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Backspace') {
            handleNumpadClick('DEL');
        } else if (e.key === 'Escape') {
            handleNumpadClick('C');
        } else if (/^[0-9]$/.test(e.key)) {
            handleNumpadClick(e.key);
        }
    };

    return (
        <div 
            className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 focus:outline-none"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <Card className="w-full max-w-md shadow-2xl bg-white/95 backdrop-blur border-none">
                <CardHeader className="space-y-1 text-center pb-4">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
                            <Lock className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        StandPOS
                    </CardTitle>
                    <CardDescription className="text-base text-slate-600">
                        Saisissez votre code d'accès sécurisé
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
                                <AlertDescription className="text-center font-medium">{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-slate-700">Identifiant Utilisateur</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-purple-500 pointer-events-none" />
                                    <select
                                        id="username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="flex h-14 w-full rounded-md border border-slate-300 bg-white px-3 py-2 pl-10 pr-10 text-lg font-medium ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 appearance-none cursor-pointer"
                                        required
                                    >
                                        <option value="" disabled>Sélectionner un utilisateur</option>
                                        {usersList.length === 0 ? (
                                            <option value="admin">Administrateur (admin)</option>
                                        ) : (
                                            usersList.map((u) => (
                                                <option key={u.username} value={u.username}>
                                                    {u.full_name} ({u.username})
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                        <ChevronDown className="w-5 h-5 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <Label htmlFor="pinCode" className="text-slate-700">Code PIN</Label>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-5 w-5 text-purple-500" />
                                    <Input
                                        id="pinCode"
                                        type={showPin ? "text" : "password"}
                                        inputMode="numeric"
                                        placeholder="••••••"
                                        value={pinCode}
                                        onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                                        className={`pl-10 pr-12 text-center text-2xl py-6 border-slate-300 focus-visible:ring-purple-500 font-bold ${!showPin ? 'tracking-[0.5em]' : 'tracking-widest'}`}
                                        required
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowPin(!showPin)}
                                        className="absolute right-3 top-3.5 text-slate-400 hover:text-purple-600 transition-colors"
                                    >
                                        {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 pt-4">
                            {NUMPAD_KEYS.map((key) => (
                                <Button
                                    key={key}
                                    type="button"
                                    variant={key === 'C' || key === 'DEL' ? 'outline' : 'secondary'}
                                    className={cn(
                                        "h-16 text-2xl font-semibold rounded-xl transition-all active:scale-95",
                                        key === 'C' && "text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200",
                                        key === 'DEL' && "text-slate-600 hover:bg-slate-200 border-slate-200",
                                        /^[0-9]$/.test(key) && "bg-white border border-slate-200 shadow-sm hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 text-slate-800"
                                    )}
                                    onClick={() => handleNumpadClick(key)}
                                >
                                    {key === 'DEL' ? <Delete className="w-6 h-6" /> : key}
                                </Button>
                            ))}
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-14 text-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg mt-4"
                            disabled={loading || pinCode.length < 4}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                                    Vérification...
                                </>
                            ) : (
                                'Valider l\'accès'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default Login;
