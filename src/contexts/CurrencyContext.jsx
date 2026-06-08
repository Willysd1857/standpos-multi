import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CurrencyContext = createContext();

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
};

export const CurrencyProvider = ({ children }) => {
    // Fetch settings to get currency and exchange rates
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => base44.entities.Settings.get()
    });

    const currency = settings?.currency || 'Ar';
    const exchangeRateUSD = settings?.exchange_rate_usd || 4500;
    const exchangeRateEUR = settings?.exchange_rate_eur || 5000;

    // Normalize currency code (handle both 'Ar' and 'MGA' for Ariary)
    const normalizedCurrency = currency === 'Ar' || currency === 'MGA' ? 'Ar' : currency;

    // Get currency symbol
    const getCurrencySymbol = React.useCallback((curr = normalizedCurrency) => {
        switch (curr) {
            case 'USD':
                return '$';
            case 'EUR':
                return '€';
            case 'Ar':
            case 'MGA':
            default:
                return 'Ar';
        }
    }, [normalizedCurrency]);

    // Convert amount from Ariary to selected currency
    const convertAmount = React.useCallback((amountInAriary, targetCurrency = normalizedCurrency) => {
        if (!amountInAriary) return 0;

        switch (targetCurrency) {
            case 'USD':
                return amountInAriary / exchangeRateUSD;
            case 'EUR':
                return amountInAriary / exchangeRateEUR;
            case 'Ar':
            case 'MGA':
            default:
                return amountInAriary;
        }
    }, [normalizedCurrency, exchangeRateUSD, exchangeRateEUR]);

    // Convert amount from selected currency back to Ariary
    const convertToAriary = React.useCallback((amount, fromCurrency = normalizedCurrency) => {
        if (!amount) return 0;

        switch (fromCurrency) {
            case 'USD':
                return amount * exchangeRateUSD;
            case 'EUR':
                return amount * exchangeRateEUR;
            case 'Ar':
            case 'MGA':
            default:
                return amount;
        }
    }, [normalizedCurrency, exchangeRateUSD, exchangeRateEUR]);

    // Format amount with proper separators
    const formatNumber = React.useCallback((amount) => {
        if (amount === undefined || amount === null || isNaN(amount)) return "0";

        // For USD and EUR, show 2 decimals
        if (normalizedCurrency === 'USD' || normalizedCurrency === 'EUR') {
            return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        }

        // For Ariary, show whole numbers with space separators
        return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }, [normalizedCurrency]);

    // Format amount with currency conversion
    const formatAmount = React.useCallback((amountInAriary) => {
        const converted = convertAmount(amountInAriary);
        return formatNumber(converted);
    }, [convertAmount, formatNumber]);

    // Format currency with symbol
    const formatCurrency = React.useCallback((amountInAriary) => {
        const formatted = formatAmount(amountInAriary);
        const symbol = getCurrencySymbol();

        // For USD and EUR, put symbol before amount
        if (normalizedCurrency === 'USD' || normalizedCurrency === 'EUR') {
            return `${symbol}${formatted}`;
        }

        // For Ariary, put symbol after amount
        return `${formatted} ${symbol}`;
    }, [formatAmount, getCurrencySymbol, normalizedCurrency]);

    // Format date in local format
    const formatDate = React.useCallback((date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }, []);

    // Format datetime in local format
    const formatDateTime = React.useCallback((date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }, []);

    const value = React.useMemo(() => ({
        currency: normalizedCurrency,
        exchangeRateUSD,
        exchangeRateEUR,
        getCurrencySymbol,
        convertAmount,
        convertToAriary,
        formatAmount,
        formatCurrency,
        formatNumber,
        formatDate,
        formatDateTime
    }), [
        normalizedCurrency,
        exchangeRateUSD,
        exchangeRateEUR,
        getCurrencySymbol,
        convertAmount,
        convertToAriary,
        formatAmount,
        formatCurrency,
        formatNumber,
        formatDate,
        formatDateTime
    ]);

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
};
