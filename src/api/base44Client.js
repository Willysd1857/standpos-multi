// API client for StandPOS SQLite backend
// Use relative path to take advantage of Vite proxy or same-origin in production
const API_BASE_URL = '/api';

export const fetchAPI = async (endpoint, options = {}) => {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Get token for authentication
    const token = localStorage.getItem('auth_token');

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...options.headers,
            },
            signal: controller.signal,
            ...options,
        });

        if (!response.ok) {
            const text = await response.text();
            let error;
            try {
                error = JSON.parse(text);
            } catch (e) {
                console.error('API Error (Non-JSON):', text);
                error = { error: `Server Error: ${response.status} ${response.statusText}\n${text.substring(0, 100)}` };
            }
            throw new Error(error.error || 'Request failed');
        }

        return response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout - Le serveur ne répond pas');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const base44 = {
    auth: {
        logout: () => {
            console.log('Logging out...');
            window.location.href = '/login';
        }
    },
    entities: {
        Category: {
            list: async (orderBy) => {
                return fetchAPI('/categories');
            },
            create: async (data) => {
                return fetchAPI('/categories', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            update: async (id, data) => {
                return fetchAPI(`/categories/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            delete: async (id) => {
                return fetchAPI(`/categories/${id}`, {
                    method: 'DELETE',
                });
            }
        },
        Product: {
            list: async () => {
                return fetchAPI('/products');
            },
            filter: async (filters) => {
                const params = new URLSearchParams();
                if (filters && filters.is_active !== undefined) {
                    params.append('is_active', filters.is_active);
                }
                return fetchAPI(`/products?${params.toString()}`);
            },
            create: async (data) => {
                return fetchAPI('/products', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            update: async (id, data) => {
                return fetchAPI(`/products/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            delete: async (id) => {
                return fetchAPI(`/products/${id}`, {
                    method: 'DELETE',
                });
            }
        },
        Transaction: {
            list: async (filters) => {
                const params = new URLSearchParams();
                if (filters?.start_date) params.append('start_date', filters.start_date);
                if (filters?.end_date) params.append('end_date', filters.end_date);
                if (filters?.limit) params.append('limit', filters.limit);
                return fetchAPI(`/transactions?${params.toString()}`);
            },
            create: async (data) => {
                return fetchAPI('/transactions', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            get: async (id) => {
                return fetchAPI(`/transactions/${id}`);
            },
            getStats: async () => {
                return fetchAPI('/transactions/stats/summary');
            },
            update: async (id, data) => {
                return fetchAPI(`/transactions/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            delete: async (id) => {
                return fetchAPI(`/transactions/${id}`, {
                    method: 'DELETE',
                });
            },
            updatePayment: async (id, paymentData) => {
                return fetchAPI(`/transactions/${id}/payment`, {
                    method: 'PUT',
                    body: JSON.stringify(paymentData),
                });
            }
        },
        Payment: {
            list: async () => {
                return fetchAPI('/transactions/payments/all');
            }
        },
        StockMovement: {
            list: async () => {
                return fetchAPI('/stock');
            },
            create: async (data) => {
                return fetchAPI('/stock', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        },
        Settings: {
            get: async () => {
                return fetchAPI('/settings');
            },
            update: async (data) => {
                return fetchAPI('/settings', {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            wipeData: async () => {
                return fetchAPI('/settings/wipe-data', {
                    method: 'POST'
                });
            }
        },
        Location: {
            list: async () => {
                return fetchAPI('/locations');
            }
        },
        Expense: {
            list: async (filters) => {
                const params = new URLSearchParams();
                if (filters?.start_date) params.append('start_date', filters.start_date);
                if (filters?.end_date) params.append('end_date', filters.end_date);
                return fetchAPI(`/expenses?${params.toString()}`);
            },
            create: async (data) => {
                return fetchAPI('/expenses', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            update: async (id, data) => {
                return fetchAPI(`/expenses/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            delete: async (id) => {
                return fetchAPI(`/expenses/${id}`, {
                    method: 'DELETE',
                });
            },
            getStats: async (filters) => {
                const params = new URLSearchParams();
                if (filters?.start_date) params.append('start_date', filters.start_date);
                if (filters?.end_date) params.append('end_date', filters.end_date);
                return fetchAPI(`/expenses/stats/summary?${params.toString()}`);
            }
        },
        Reports: {
            getDaily: async (date) => {
                const params = new URLSearchParams();
                if (date) params.append('date', date);
                return fetchAPI(`/reports/daily?${params.toString()}`);
            }
        },
        Purchase: {
            list: async () => {
                return fetchAPI('/purchases');
            },
            create: async (data) => {
                return fetchAPI('/purchases', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        },
        PurchaseGroup: {
            list: async (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return fetchAPI(`/purchase-groups${queryString ? `?${queryString}` : ''}`);
            },
            get: async (id) => {
                return fetchAPI(`/purchase-groups/${id}`);
            },
            create: async (data) => {
                return fetchAPI('/purchase-groups', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            receive: async (id) => {
                return fetchAPI(`/purchase-groups/${id}/receive`, {
                    method: 'POST'
                });
            }
        },
        Ingredient: {
            list: async () => {
                return fetchAPI('/stock/ingredients');
            }
        },
        IngredientUsage: {
            list: async () => {
                return fetchAPI('/ingredient-usages');
            },
            create: async (data) => {
                return fetchAPI('/ingredient-usages', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        },
        Packaging: {
            getHistory: async (filters) => {
                const params = new URLSearchParams();
                if (filters?.type) params.append('type', filters.type);
                if (filters?.start_date) params.append('start_date', filters.start_date);
                if (filters?.end_date) params.append('end_date', filters.end_date);
                return fetchAPI(`/packaging/history?${params.toString()}`);
            },
            getConsignments: async (filters) => {
                const params = new URLSearchParams();
                if (filters?.entity_type) params.append('entity_type', filters.entity_type);
                return fetchAPI(`/packaging/consignments?${params.toString()}`);
            },
            getSupplierOutstanding: async () => {
                return fetchAPI('/packaging/supplier-outstanding');
            },
            verifyReception: async (data) => {
                return fetchAPI('/packaging/verify-reception', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            returnConsignment: async (id, data) => {
                return fetchAPI(`/packaging/consignments/${id}/return`, {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            customerReturn: async (data) => {
                return fetchAPI('/packaging/customer-return', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            markLost: async (id) => {
                return fetchAPI(`/packaging/consignments/${id}/lost`, {
                    method: 'POST',
                });
            },
            declareBreakage: async (data) => {
                return fetchAPI('/packaging/breakage', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            transferEmpty: async (data) => {
                return fetchAPI('/packaging/transfer-empty', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        },
        Supplier: {
            list: async () => {
                return fetchAPI('/suppliers');
            },
            get: async (id) => {
                return fetchAPI(`/suppliers/${id}`);
            },
            create: async (data) => {
                return fetchAPI('/suppliers', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            },
            update: async (id, data) => {
                return fetchAPI(`/suppliers/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            },
            returnPackaging: async (id, data) => {
                return fetchAPI(`/suppliers/${id}/return-packaging`, {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        },
        BIReports: {
            getPeriodic: async (period) => {
                const params = new URLSearchParams();
                if (period) params.append('period', period);
                return fetchAPI(`/bi-reports/periodic?${params.toString()}`);
            },
            getCashflow: async (date) => {
                const params = new URLSearchParams();
                if (date) params.append('date', date);
                return fetchAPI(`/bi-reports/cashflow?${params.toString()}`);
            },
            getMargins: async (date) => {
                const params = new URLSearchParams();
                if (date) params.append('date', date);
                return fetchAPI(`/bi-reports/margins?${params.toString()}`);
            },
            getThirdParties: async () => {
                return fetchAPI(`/bi-reports/third-parties`);
            },
            getFinancialStatus: async () => {
                return fetchAPI(`/bi-reports/financial-status`);
            }
        },
        StockTransfer: {
            list: async () => {
                return fetchAPI('/stock-transfers');
            },
            receivePackaging: async (id, data) => {
                return fetchAPI(`/stock-transfers/${id}/receive-packaging`, {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
            }
        }
    },
    integrations: {
        Core: {
            UploadFile: async ({ file }) => {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Upload failed');
                }

                return response.json();
            }
        }
    }
};
