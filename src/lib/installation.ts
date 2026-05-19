import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALLATION_ID_KEY = 'installation_id';

function createInstallationId() {
  const random = Math.random().toString(36).slice(2);
  return `inst_${Date.now()}_${random}`;
}

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

export async function getInstallationId() {
  const existing = await getStoredValue(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = createInstallationId();
  await setStoredValue(INSTALLATION_ID_KEY, created);
  return created;
}
