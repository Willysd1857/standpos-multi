import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
    return twMerge(clsx(...inputs))
}

/**
 * Robust currency formatter for the application.
 * Ensures consistent thousand separators across different environments.
 */
export const formatAmount = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "0";
    // Manual formatting to avoid locale-specific issues (like slashes in PDFs or weird separators)
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export const formatCurrency = (amount) => {
    return `${formatAmount(amount)} Ar`;
};

export const createPageUrl = (pageName) => {
    const customUrls = {
        'StockTransfers': '/stock-transfers',
        'LossesAndDamages': '/losses',
        'PackagingHistory': '/packaging-history',
        'WarehousePackaging': '/warehouse-packaging',
        'ActivityReports': '/activity-reports'
    };
    return customUrls[pageName] || `/${pageName.toLowerCase()}`;
};

export const formatQuantity = (quantity, unit) => {
    if (quantity === undefined || quantity === null || isNaN(quantity)) return "0";

    const lowerUnit = unit?.toLowerCase().trim() || '';

    // Precise check: decimals only for kg, g, l, ml or units containing 'litre'
    // This prevents 'bouteille' from matching because it contains 'l'
    const isDecimal =
        lowerUnit === 'kg' ||
        lowerUnit === 'g' ||
        lowerUnit === 'l' ||
        lowerUnit === 'ml' ||
        lowerUnit.includes('litre');

    if (isDecimal) {
        return Number(quantity).toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    // For other units like 'bouteille', 'pièce', etc., show as whole number
    return Math.round(quantity).toString();
};
