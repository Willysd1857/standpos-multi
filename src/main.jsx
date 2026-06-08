import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import App from './App.jsx'
import { clsx } from 'clsx'
import './index.css'

// Fix for dependencies expecting global clsx
window.clsx = clsx

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 5, // 5 seconds - data stays fresh for 5s (more reactive)
            gcTime: 1000 * 60 * 30, // 30 minutes - renamed from cacheTime in v5
            refetchOnWindowFocus: true, // Refetch when window regains focus (good for POS)
            refetchOnMount: true, // Always refetch on component mount
            retry: 1,
            networkMode: 'always' // Since it's a local app, we should always try to fetch
        }
    }
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <CurrencyProvider>
                <AppSettingsProvider>
                    <App />
                </AppSettingsProvider>
            </CurrencyProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
