// Utility functions

export const createPageUrl = (pageName) => {
    return `/${pageName.toLowerCase()}`;
};

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XAF',
    }).format(amount);
};
