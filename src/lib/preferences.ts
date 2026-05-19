import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { PinType, ThemePreference } from '@/types/domain';

const APP_PREFERENCES_KEY = 'app_preferences_v1';

export type AppPreferences = {
  themePreference: ThemePreference;
  alias: string;
  defaultPinType: PinType;
};

const DEFAULT_PREFERENCES: AppPreferences = {
  themePreference: 'system',
  alias: '',
  defaultPinType: 'police_car',
};

async function getStoredValue(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getAppPreferences(): Promise<AppPreferences> {
  const raw = await getStoredValue(APP_PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      themePreference:
        parsed.themePreference === 'light' || parsed.themePreference === 'dark'
          ? parsed.themePreference
          : 'system',
      alias: typeof parsed.alias === 'string' ? parsed.alias : '',
      defaultPinType: parsed.defaultPinType === 'camera' ? 'camera' : 'police_car',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveAppPreferences(preferences: AppPreferences) {
  await setStoredValue(APP_PREFERENCES_KEY, JSON.stringify(preferences));
}
