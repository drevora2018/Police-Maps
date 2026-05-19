import React from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppPreferences, getAppPreferences, saveAppPreferences } from '@/lib/preferences';
import { PinType, ThemePreference } from '@/types/domain';

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  effectiveTheme: 'light' | 'dark';
  setThemePreference: (themePreference: ThemePreference) => Promise<void>;
  setAlias: (alias: string) => Promise<void>;
  setDefaultPinType: (defaultPinType: PinType) => Promise<void>;
};

const AppPreferencesContext = React.createContext<AppPreferencesContextValue | null>(null);

const DEFAULT_PREFERENCES: AppPreferences = {
  themePreference: 'system',
  alias: '',
  defaultPinType: 'police_car',
};

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme();
  const [preferences, setPreferences] = React.useState<AppPreferences>(DEFAULT_PREFERENCES);

  React.useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const stored = await getAppPreferences();
      if (!mounted) return;
      setPreferences(stored);
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const updatePreferences = React.useCallback(async (next: AppPreferences) => {
    setPreferences(next);
    await saveAppPreferences(next);
  }, []);

  const setThemePreference = React.useCallback(
    async (themePreference: ThemePreference) => {
      await updatePreferences({ ...preferences, themePreference });
    },
    [preferences, updatePreferences]
  );

  const setAlias = React.useCallback(
    async (alias: string) => {
      await updatePreferences({ ...preferences, alias: alias.trim() });
    },
    [preferences, updatePreferences]
  );

  const setDefaultPinType = React.useCallback(
    async (defaultPinType: PinType) => {
      await updatePreferences({ ...preferences, defaultPinType });
    },
    [preferences, updatePreferences]
  );

  const resolvedSystemTheme = systemTheme === 'dark' ? 'dark' : 'light';
  const effectiveTheme =
    preferences.themePreference === 'system' ? resolvedSystemTheme : preferences.themePreference;

  return (
    <AppPreferencesContext.Provider
      value={{
        preferences,
        effectiveTheme,
        setThemePreference,
        setAlias,
        setDefaultPinType,
      }}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const context = React.useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return context;
}

