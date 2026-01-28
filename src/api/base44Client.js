// API client for Moonlight SQLite backend
// Use relative path to take advantage of Vite proxy or same-origin in production
const API_BASE_URL = '/api';

const fetchAPI = async (endpoint, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
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
            list: async () => {
                return fetchAPI('/transactions');
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
