import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = 'pins';
type PinNotificationData = {
  type: 'new_pin';
  pin_id: string;
  pin_type: 'police_car' | 'camera';
  lat: number;
  lng: number;
  location_label?: string | null;
};

type ProximityNotificationData = {
  type: 'pin_proximity';
  pin_id: string;
  pin_type: 'police_car' | 'camera';
  distance_m: number;
};

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Pin Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#208AEF',
    });
  }
}

export async function upsertNotificationPreference(params: {
  installationId: string;
  notificationsEnabled: boolean;
  expoPushToken?: string | null;
}) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('device_preferences').upsert(
    {
      installation_id: params.installationId,
      notifications_enabled: params.notificationsEnabled,
      expo_push_token: params.expoPushToken ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'installation_id' }
  );
  if (error) throw error;
}

export async function getNotificationPreference(installationId: string) {
  if (!isSupabaseConfigured) {
    return false;
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('device_preferences')
    .select('notifications_enabled')
    .eq('installation_id', installationId)
    .maybeSingle();
  if (error) throw error;
  return data?.notifications_enabled ?? true;
}

export async function registerForPushNotifications(params: {
  installationId: string;
  enabled: boolean;
}) {
  if (!isSupabaseConfigured) {
    return null;
  }
  await ensureChannel();

  if (!params.enabled) {
    await upsertNotificationPreference({
      installationId: params.installationId,
      notificationsEnabled: false,
      expoPushToken: null,
    });
    return null;
  }

  if (!Device.isDevice) {
    await upsertNotificationPreference({
      installationId: params.installationId,
      notificationsEnabled: true,
      expoPushToken: null,
    });
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== 'granted') {
    await upsertNotificationPreference({
      installationId: params.installationId,
      notificationsEnabled: false,
      expoPushToken: null,
    });
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const expoPushToken = tokenResponse.data;

  await upsertNotificationPreference({
    installationId: params.installationId,
    notificationsEnabled: true,
    expoPushToken,
  });

  return expoPushToken;
}

export async function showInAppPinNotification(params: {
  pinId: string;
  pinType: 'police_car' | 'camera';
  lat: number;
  lng: number;
  locationLabel?: string | null;
  note?: string | null;
}) {
  await ensureChannel();
  const label = params.pinType === 'camera' ? 'Camera' : 'Police car';
  const where = params.locationLabel ? ` at ${params.locationLabel}` : '';
  const body = params.note ? `${label}${where}: ${params.note}` : `${label} pin dropped${where}.`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `New ${label} pin`,
      body,
      data: {
        type: 'new_pin',
        pin_id: params.pinId,
        pin_type: params.pinType,
        lat: params.lat,
        lng: params.lng,
        location_label: params.locationLabel ?? null,
      } satisfies PinNotificationData,
    },
    trigger: null,
  });
}

export async function showPinProximityNotification(params: {
  pinId: string;
  pinType: 'police_car' | 'camera';
  distanceMeters: number;
  locationLabel?: string | null;
}) {
  await ensureChannel();
  const label = params.pinType === 'camera' ? 'Camera' : 'Police car';
  const where = params.locationLabel ? ` near ${params.locationLabel}` : '';
  const rounded = Math.max(1, Math.round(params.distanceMeters));
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Proximity alert: ${label} pin`,
      body: `${rounded}m away${where}.`,
      data: {
        type: 'pin_proximity',
        pin_id: params.pinId,
        pin_type: params.pinType,
        distance_m: rounded,
      } satisfies ProximityNotificationData,
    },
    trigger: null,
  });
}
