import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAppPreferences } from '@/contexts/app-preferences-context';
import { getInstallationId } from '@/lib/installation';
import {
  showInAppPinNotification,
  showPinProximityNotification,
} from '@/services/notifications-service';
import { createPin, deletePin, listActivePins, subscribeToPinChanges } from '@/services/pins-service';
import { Pin, PinType } from '@/types/domain';

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

const FOCUS_REGION = {
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f232a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d2d7df' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f232a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a313a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1622' }] },
];

type ProximityState = {
  reached400: boolean;
  reached200: boolean;
};

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return earthRadius * c;
}

async function reverseGeocodeLabel(lat: number, lng: number) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const response = await fetch(url);
    const json = (await response.json()) as {
      results?: { address_components?: { long_name: string; types: string[] }[] }[];
    };
    const components = json.results?.[0]?.address_components ?? [];
    const route = components.find((c) => c.types.includes('route'))?.long_name;
    const locality =
      components.find((c) => c.types.includes('locality'))?.long_name ??
      components.find((c) => c.types.includes('postal_town'))?.long_name ??
      components.find((c) => c.types.includes('administrative_area_level_2'))?.long_name;
    if (route && locality) return `${route}, ${locality}`;
    if (locality) return locality;
    return route ?? null;
  } catch {
    return null;
  }
}

export default function MapScreen() {
  const { effectiveTheme, preferences, setDefaultPinType } = useAppPreferences();
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const [pins, setPins] = React.useState<Pin[]>([]);
  const [installationId, setInstallationId] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const [radarOn, setRadarOn] = React.useState(false);
  const [currentCoords, setCurrentCoords] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = React.useRef<InstanceType<any> | null>(null);
  const didInitialCenterRef = React.useRef(false);
  const suppressMapPressUntil = React.useRef(0);
  const locationSubRef = React.useRef<Location.LocationSubscription | null>(null);
  const proximityStateRef = React.useRef<Record<string, ProximityState>>({});

  React.useEffect(() => {
    let mounted = true;
    const setup = async () => {
      try {
        const id = await getInstallationId();
        const activePins = await listActivePins();
        if (!mounted) return;
        setInstallationId(id);
        setPins(activePins);
      } catch (error) {
        console.warn('Map bootstrap failed', error);
      }
    };
    void setup();

    const unsubscribe = subscribeToPinChanges(({ eventType, new: nextPin, old }) => {
      setPins((prev) => {
        if (eventType === 'INSERT' && nextPin) {
          return [nextPin, ...prev.filter((item) => item.id !== nextPin.id)];
        }
        if (eventType === 'UPDATE' && nextPin) {
          return prev.map((item) => (item.id === nextPin.id ? nextPin : item));
        }
        if (eventType === 'DELETE' && old) {
          return prev.filter((item) => item.id !== old.id);
        }
        return prev;
      });

      if (eventType === 'INSERT' && nextPin && nextPin.created_by_installation_id !== installationId) {
        void showInAppPinNotification({
          pinId: nextPin.id,
          pinType: nextPin.pin_type,
          lat: nextPin.lat,
          lng: nextPin.lng,
          locationLabel: nextPin.location_label,
          note: nextPin.note,
        });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [installationId]);

  React.useEffect(() => {
    const lat = Number(params.focusLat);
    const lng = Number(params.focusLng);
    if (Number.isNaN(lat) || Number.isNaN(lng) || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: FOCUS_REGION.latitudeDelta,
        longitudeDelta: FOCUS_REGION.longitudeDelta,
      },
      450
    );
  }, [params.focusLat, params.focusLng]);

  React.useEffect(() => {
    const centerInitially = async () => {
      if (didInitialCenterRef.current) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      didInitialCenterRef.current = true;
      setCurrentCoords(coords);
      mapRef.current?.animateToRegion(
        {
          ...coords,
          latitudeDelta: FOCUS_REGION.latitudeDelta,
          longitudeDelta: FOCUS_REGION.longitudeDelta,
        },
        400
      );
    };
    void centerInitially();
  }, []);

  React.useEffect(() => {
    const cleanup = () => {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };

    if (!radarOn) {
      cleanup();
      return;
    }

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Enable location permission to use proximity radar.');
        setRadarOn(false);
        return;
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 25,
          timeInterval: 5000,
        },
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setCurrentCoords(coords);
        }
      );
      locationSubRef.current = sub;
    };

    void startTracking();
    return cleanup;
  }, [radarOn]);

  React.useEffect(() => {
    if (!radarOn || !currentCoords) return;

    mapRef.current?.animateToRegion(
      {
        ...currentCoords,
        latitudeDelta: FOCUS_REGION.latitudeDelta,
        longitudeDelta: FOCUS_REGION.longitudeDelta,
      },
      300
    );

    for (const pin of pins) {
      const state = proximityStateRef.current[pin.id] ?? { reached400: false, reached200: false };
      const distance = distanceMeters(currentCoords.latitude, currentCoords.longitude, pin.lat, pin.lng);

      if (distance <= 200 && !state.reached200) {
        state.reached200 = true;
        state.reached400 = true;
        proximityStateRef.current[pin.id] = state;
        Alert.alert(
          'PROXIMITY ALERT',
          `Very close to ${pin.pin_type === 'camera' ? 'camera' : 'police'} pin (${Math.round(distance)}m).`,
          [{ text: 'OK' }]
        );
        void showPinProximityNotification({
          pinId: pin.id,
          pinType: pin.pin_type,
          distanceMeters: distance,
          locationLabel: pin.location_label,
        });
        continue;
      }

      if (distance <= 400 && !state.reached400) {
        state.reached400 = true;
        proximityStateRef.current[pin.id] = state;
        Alert.alert(
          'Proximity warning',
          `Approaching ${pin.pin_type === 'camera' ? 'camera' : 'police'} pin (${Math.round(distance)}m).`,
          [{ text: 'OK' }]
        );
        void showPinProximityNotification({
          pinId: pin.id,
          pinType: pin.pin_type,
          distanceMeters: distance,
          locationLabel: pin.location_label,
        });
      }

      if (distance > 450) {
        state.reached400 = false;
      }
      if (distance > 250) {
        state.reached200 = false;
      }
      proximityStateRef.current[pin.id] = state;
    }
  }, [currentCoords, pins, radarOn]);

  const savePin = async (latitude: number, longitude: number, pinType: PinType, persistDefault: boolean) => {
    setBusy(true);
    try {
      const locationLabel = await reverseGeocodeLabel(latitude, longitude);
      const created = await createPin({
        lat: latitude,
        lng: longitude,
        locationLabel,
        pinType,
        createdByInstallationId: installationId,
      });
      setPins((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      if (persistDefault) {
        await setDefaultPinType(pinType);
      }
    } catch (error) {
      console.warn('Create pin failed', error);
    } finally {
      setBusy(false);
    }
  };

  const onMapPress = async (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (!installationId || busy) return;
    if (Date.now() < suppressMapPressUntil.current) return;

    const { latitude, longitude } = event.nativeEvent.coordinate;
    Alert.alert('Drop pin', 'Choose pin type for this location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Police car',
        style: 'default',
        onPress: () =>
          void savePin(
            latitude,
            longitude,
            'police_car',
            preferences.defaultPinType !== 'police_car'
          ),
      },
      {
        text: 'Camera',
        style: 'default',
        onPress: () =>
          void savePin(latitude, longitude, 'camera', preferences.defaultPinType !== 'camera'),
      },
    ]);
  };

  const openPinModal = (pin: Pin) => {
    suppressMapPressUntil.current = Date.now() + 700;
    Alert.alert(
      pin.location_label ?? (pin.pin_type === 'camera' ? 'Camera pin' : 'Police car pin'),
      pin.note ?? `Expires ${new Date(pin.expires_at).toLocaleString()}`,
      [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Remove pin',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePin(pin.id);
              setPins((prev) => prev.filter((item) => item.id !== pin.id));
            } catch (error) {
              console.warn('Delete pin failed', error);
            }
          },
        },
      ]
    );
  };

  const onMapLongPress = (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    let nearest: Pin | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const pin of pins) {
      const distance = distanceMeters(latitude, longitude, pin.lat, pin.lng);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = pin;
      }
    }

    // Fallback for devices where marker long-press is unreliable with custom marker content.
    if (nearest && nearestDistance <= 18) {
      openPinModal(nearest);
    }
  };

  const centerOnMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location permission needed', 'Enable location permission to center map on your GPS position.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    setCurrentCoords(coords);
    mapRef.current?.animateToRegion(
      {
        ...coords,
        latitudeDelta: FOCUS_REGION.latitudeDelta,
        longitudeDelta: FOCUS_REGION.longitudeDelta,
      },
      400
    );
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.center}>
        <ThemedText>Map tab is supported on iOS and Android only.</ThemedText>
      </SafeAreaView>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNativeMaps = require('react-native-maps');
  const MapView = ReactNativeMaps.default;
  const Marker = ReactNativeMaps.Marker;
  const PROVIDER_GOOGLE = ReactNativeMaps.PROVIDER_GOOGLE;

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={effectiveTheme === 'dark' ? DARK_MAP_STYLE : []}
        showsUserLocation
        onLongPress={onMapLongPress}
        onPress={onMapPress}>
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.location_label ?? (pin.pin_type === 'camera' ? 'Camera pin' : 'Police car pin')}
            description={pin.note || `Expires ${new Date(pin.expires_at).toLocaleString()}`}
            onPress={() => {
              suppressMapPressUntil.current = Date.now() + 350;
            }}
            onLongPress={() => {
              openPinModal(pin);
            }}>
            <View style={styles.markerWrap}>
              <View
                style={[
                  styles.badge,
                  pin.pin_type === 'police_car' ? styles.badgePolice : styles.badgeCamera,
                ]}>
                <ThemedText type="smallBold" style={styles.badgeEmoji}>
                  {pin.pin_type === 'police_car' ? '\u{1F693}' : '\u{1F4F7}'}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.pinBody,
                  pin.pin_type === 'police_car' ? styles.pinPolice : styles.pinCamera,
                ]}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.controls}>
        <Pressable style={[styles.controlButton, radarOn ? styles.controlOn : null]} onPress={() => setRadarOn((v) => !v)}>
          <ThemedText type="smallBold">{radarOn ? 'Radar ON' : 'Radar OFF'}</ThemedText>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={() => void centerOnMe()}>
          <ThemedText type="smallBold">Center GPS</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  markerWrap: {
    alignItems: 'center',
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: -4,
    zIndex: 2,
  },
  badgePolice: {
    backgroundColor: '#2F7BF6',
  },
  badgeCamera: {
    backgroundColor: '#E68A2E',
  },
  badgeEmoji: {
    fontSize: 14,
    lineHeight: 16,
  },
  pinBody: {
    width: 16,
    height: 16,
    borderRadius: 8,
    transform: [{ rotate: '45deg' }],
    marginTop: -2,
  },
  pinPolice: {
    backgroundColor: '#2F7BF6',
  },
  pinCamera: {
    backgroundColor: '#E68A2E',
  },
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 18,
    gap: 8,
  },
  controlButton: {
    backgroundColor: '#E9E9ED',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  controlOn: {
    backgroundColor: '#FFD56A',
  },
});
