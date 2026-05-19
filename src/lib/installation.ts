import * as SecureStore from 'expo-secure-store';

const INSTALLATION_ID_KEY = 'installation_id';

function createInstallationId() {
  const random = Math.random().toString(36).slice(2);
  return `inst_${Date.now()}_${random}`;
}

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = createInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created);
  return created;
}
