import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppPreferencesProvider, useAppPreferences } from '@/contexts/app-preferences-context';
import { getInstallationId } from '@/lib/installation';
import {
  getNotificationPreference,
  registerForPushNotifications,
} from '@/services/notifications-service';

function TabLayoutContent() {
  const { effectiveTheme } = useAppPreferences();
  const router = useRouter();

  React.useEffect(() => {
    const bootstrapNotifications = async () => {
      try {
        const installationId = await getInstallationId();
        const preferred = await getNotificationPreference(installationId);
        await registerForPushNotifications({
          installationId,
          enabled: preferred,
        });
      } catch (error) {
        console.warn('Notification bootstrap failed', error);
      }
    };

    void bootstrapNotifications();
  }, []);

  React.useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type !== 'new_pin') return;
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      router.push({
        pathname: '/map',
        params: {
          focusLat: String(lat),
          focusLng: String(lng),
        },
      });
    });
    return () => {
      subscription.remove();
    };
  }, [router]);

  return (
    <ThemeProvider value={effectiveTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <AppPreferencesProvider>
      <TabLayoutContent />
    </AppPreferencesProvider>
  );
}
