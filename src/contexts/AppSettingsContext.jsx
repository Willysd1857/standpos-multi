import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const AppSettingsContext = createContext(null);

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return ctx;
};

export const AppSettingsProvider = ({ children }) => {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.Settings.get(),
  });

  const enableTables = false;

  const enableIngredientUsage = settings?.enable_ingredient_usage !== undefined
    ? Boolean(settings.enable_ingredient_usage)
    : true;

  const value = useMemo(
    () => ({ enableTables, enableIngredientUsage, settingsLoading: isLoading }),
    [enableTables, enableIngredientUsage, isLoading]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};
