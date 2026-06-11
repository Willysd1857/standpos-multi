import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Filter, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const AuditLogs = () => {
    const { token } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [filters, setFilters] = useState({
        start_date: '',
        end_date: '',
        action: ''
    });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (filters.action) params.append('action', filters.action);

            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/audit-logs?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setLogs(data);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
            toast.error('Erreur lors du chargement des journaux');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [token]);



    const getActionBadgeVariant = (action) => {
        if (action.includes('CREATE')) return 'default';
        if (action.includes('UPDATE')) return 'secondary';
        if (action.includes('DELETE')) return 'destructive';
        return 'outline';
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
                <h2 className="text-2xl font-bold">Journaux d'Audit</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg items-end">
                <div>
                    <Label htmlFor="start_date">Date de début</Label>
                    <Input
                        id="start_date"
                        type="date"
                        value={filters.start_date}
                        onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                    />
                </div>
                <div>
                    <Label htmlFor="end_date">Date de fin</Label>
                    <Input
                        id="end_date"
                        type="date"
                        value={filters.end_date}
                        onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                    />
                </div>
                <div>
                    <Button onClick={fetchLogs} className="w-full">
                        <Filter className="mr-2 h-4 w-4" />
                        Filtrer les journaux
                    </Button>
                </div>
            </div>

            {/* Scrollable table container */}
            <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-white z-10">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Utilisateur</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Type d'entité</TableHead>
                                <TableHead>Détails</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs
                                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                .map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>
                                            {(() => {
                                                // SQLite dates are UTC, so we append 'Z' if it's missing to ensure correct parsing
                                                const dateStr = log.created_at.includes('Z') ? log.created_at : `${log.created_at.replace(' ', 'T')}Z`;
                                                return new Date(dateStr).toLocaleString('fr-FR', {
                                                    timeZone: 'Indian/Antananarivo', // Force GMT+3 for display
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit'
                                                });
                                            })()}
                                        </TableCell>
                                        <TableCell className={`font-medium ${log.username === 'system' ? 'text-gray-400 italic' : 'text-purple-700'}`}>
                                            {log.username}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getActionBadgeVariant(log.action)}>
                                                {log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{log.entity_type || '-'}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {log.details ? JSON.stringify(log.details) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Pagination */}
            {logs.length > 0 && (
                <div className="flex items-center justify-between px-2">
                    <div className="text-sm text-gray-500">
                        Affichage de {((currentPage - 1) * itemsPerPage) + 1} à {Math.min(currentPage * itemsPerPage, logs.length)} sur {logs.length} entrées
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Précédent
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.ceil(logs.length / itemsPerPage) }, (_, i) => i + 1)
                                .filter(page => {
                                    // Show first page, last page, current page, and pages around current
                                    return page === 1 ||
                                        page === Math.ceil(logs.length / itemsPerPage) ||
                                        Math.abs(page - currentPage) <= 1;
                                })
                                .map((page, index, array) => (
                                    <React.Fragment key={page}>
                                        {index > 0 && array[index - 1] !== page - 1 && (
                                            <span className="px-2">...</span>
                                        )}
                                        <Button
                                            variant={currentPage === page ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setCurrentPage(page)}
                                            className="min-w-[40px]"
                                        >
                                            {page}
                                        </Button>
                                    </React.Fragment>
                                ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(logs.length / itemsPerPage), prev + 1))}
                            disabled={currentPage === Math.ceil(logs.length / itemsPerPage)}
                        >
                            Suivant
                        </Button>
                    </div>
                </div>
            )}

            {logs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    Aucun journal d'audit trouvé
                </div>
            )}
        </div>
    );
};

export default AuditLogs;
