import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { getInstallationId } from '@/lib/installation';
import { createPin, deletePin, listActivePins, subscribeToPinChanges } from '@/services/pins-service';
import { Pin, PinType } from '@/types/domain';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 16;
const RADAR_CLEAR_400 = 450;
const RADAR_CLEAR_200 = 250;

type ProximityState = {
  reached400: boolean;
  reached200: boolean;
};

type LeafletModule = typeof import('leaflet');

function pinIcon(L: LeafletModule, pinType: PinType) {
  const bg = pinType === 'police_car' ? '#2F7BF6' : '#E68A2E';
  const emoji = pinType === 'police_car' ? '\u{1F693}' : '\u{1F4F7}';
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:34px;height:34px;border-radius:17px;background:${bg};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;">${emoji}</div>
      <div style="width:14px;height:14px;background:${bg};transform:rotate(45deg);margin-top:-2px;"></div>
    </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}

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

export default function MapWebScreen() {
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const mapElRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const leafletRef = React.useRef<LeafletModule | null>(null);
  const markersRef = React.useRef<Record<string, any>>({});
  const [pins, setPins] = React.useState<Pin[]>([]);
  const [installationId, setInstallationId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [radarOn, setRadarOn] = React.useState(false);
  const [currentCoords, setCurrentCoords] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [alertsEnabled, setAlertsEnabled] = React.useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = React.useState(false);
  const busyRef = React.useRef(false);
  const proximityStateRef = React.useRef<Record<string, ProximityState>>({});
  const watchIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    const ua = navigator.userAgent || '';
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    const isStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    setShowIosInstallHint(isiOS && !isStandalone);
  }, []);

  React.useEffect(() => {
    const id = 'leaflet-css-cdn';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const setup = async () => {
      const [L, initialPins] = await Promise.all([
        import('leaflet'),
        listActivePins(),
      ]);
      if (!mounted || !mapElRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapElRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      mapRef.current = map;

      map.on('click', async (e: any) => {
        if (busyRef.current) return;
        const lat = e.latlng.lat as number;
        const lng = e.latlng.lng as number;
        const choice = window.prompt('Pin type? Enter "p" for police or "c" for camera.', 'p');
        if (!choice) return;
        const pinType: PinType = choice.toLowerCase().startsWith('c') ? 'camera' : 'police_car';

        setBusy(true);
        try {
          const locationLabel = await reverseGeocodeLabel(lat, lng);
          const created = await createPin({
            lat,
            lng,
            pinType,
            locationLabel,
            createdByInstallationId: 'web-client',
          });
          setPins((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
        } finally {
          setBusy(false);
        }
      });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setCurrentCoords(coords);
          map.setView([coords.latitude, coords.longitude], FOCUS_ZOOM);
        });
      }

      setPins(initialPins);
      const id = await getInstallationId();
      if (mounted) {
        setInstallationId(id);
      }
    };

    void setup();
    const unsubscribe = subscribeToPinChanges(({ eventType, new: nextPin, old }) => {
      setPins((prev) => {
        if (eventType === 'INSERT' && nextPin) return [nextPin, ...prev.filter((p) => p.id !== nextPin.id)];
        if (eventType === 'UPDATE' && nextPin) return prev.map((p) => (p.id === nextPin.id ? nextPin : p));
        if (eventType === 'DELETE' && old) return prev.filter((p) => p.id !== old.id);
        return prev;
      });

      if (
        eventType === 'INSERT' &&
        nextPin &&
        nextPin.created_by_installation_id !== installationId &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        const title = `New ${nextPin.pin_type === 'camera' ? 'camera' : 'police car'} pin`;
        const body = nextPin.location_label ?? `Tap to focus map`;
        const notification = new Notification(title, { body, tag: `pin-${nextPin.id}` });
        notification.onclick = () => {
          window.focus();
          mapRef.current?.setView([nextPin.lat, nextPin.lng], FOCUS_ZOOM);
        };
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [installationId]);

  React.useEffect(() => {
    if (!radarOn || !navigator.geolocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentCoords(coords);
      },
      () => {
        setRadarOn(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [radarOn]);

  React.useEffect(() => {
    if (!radarOn || !currentCoords || !mapRef.current) return;
    mapRef.current.setView([currentCoords.latitude, currentCoords.longitude], FOCUS_ZOOM);

    for (const pin of pins) {
      const state = proximityStateRef.current[pin.id] ?? { reached400: false, reached200: false };
      const distance = distanceMeters(currentCoords.latitude, currentCoords.longitude, pin.lat, pin.lng);
      const label = pin.pin_type === 'camera' ? 'camera' : 'police';

      if (distance <= 200 && !state.reached200) {
        state.reached200 = true;
        state.reached400 = true;
        proximityStateRef.current[pin.id] = state;
        alert(`PROXIMITY ALERT: Very close to ${label} pin (${Math.round(distance)}m)`);
        if (alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const notification = new Notification('PROXIMITY ALERT', {
            body: `${Math.round(distance)}m from ${label} pin${pin.location_label ? ` near ${pin.location_label}` : ''}`,
            tag: `proximity-200-${pin.id}`,
          });
          notification.onclick = () => {
            window.focus();
            mapRef.current?.setView([pin.lat, pin.lng], FOCUS_ZOOM + 1);
          };
        }
        continue;
      }

      if (distance <= 400 && !state.reached400) {
        state.reached400 = true;
        proximityStateRef.current[pin.id] = state;
        alert(`Proximity warning: Approaching ${label} pin (${Math.round(distance)}m)`);
        if (alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const notification = new Notification('Proximity warning', {
            body: `${Math.round(distance)}m from ${label} pin${pin.location_label ? ` near ${pin.location_label}` : ''}`,
            tag: `proximity-400-${pin.id}`,
          });
          notification.onclick = () => {
            window.focus();
            mapRef.current?.setView([pin.lat, pin.lng], FOCUS_ZOOM);
          };
        }
      }

      if (distance > RADAR_CLEAR_400) {
        state.reached400 = false;
      }
      if (distance > RADAR_CLEAR_200) {
        state.reached200 = false;
      }
      proximityStateRef.current[pin.id] = state;
    }
  }, [alertsEnabled, currentCoords, pins, radarOn]);

  React.useEffect(() => {
    const lat = Number(params.focusLat);
    const lng = Number(params.focusLng);
    if (!mapRef.current || Number.isNaN(lat) || Number.isNaN(lng)) return;
    mapRef.current.setView([lat, lng], FOCUS_ZOOM);
  }, [params.focusLat, params.focusLng]);

  React.useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    Object.values(markersRef.current).forEach((marker: any) => map.removeLayer(marker));
    markersRef.current = {};

    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(L, pin.pin_type),
      }).addTo(map);

      const title = pin.location_label ?? (pin.pin_type === 'camera' ? 'Camera pin' : 'Police car pin');
      const detail = pin.note ?? `Expires ${new Date(pin.expires_at).toLocaleString()}`;
      marker.bindPopup(`<b>${title}</b><br/>${detail}`);
      marker.on('contextmenu', async () => {
        const confirmed = window.confirm(`Remove pin at "${title}"?`);
        if (!confirmed) return;
        await deletePin(pin.id);
        setPins((prev) => prev.filter((p) => p.id !== pin.id));
      });

      markersRef.current[pin.id] = marker;
    }
  }, [pins]);

  const centerOnMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCurrentCoords(coords);
      mapRef.current?.setView([coords.latitude, coords.longitude], FOCUS_ZOOM);
    });
  };

  const enableAlerts = async () => {
    if (typeof Notification === 'undefined') {
      return;
    }
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === 'granted');
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
      {showIosInstallHint ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            top: 12,
            background: '#111827',
            color: '#FFFFFF',
            borderRadius: 10,
            padding: 10,
            fontSize: 13,
            lineHeight: 1.35,
          }}>
          For better iPhone experience, open in Safari, tap Share, then <b>Add to Home Screen</b>.
        </div>
      ) : null}
      <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          onClick={() => setRadarOn((v) => !v)}
          style={{
            background: radarOn ? '#FFD56A' : '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #D1D5DB',
            padding: '8px 10px',
            fontWeight: 700,
            cursor: 'pointer',
          }}>
          {radarOn ? 'Radar ON' : 'Radar OFF'}
        </button>
        <button
          type="button"
          onClick={() => void enableAlerts()}
          style={{
            background: alertsEnabled ? '#D1FAE5' : '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #D1D5DB',
            padding: '8px 10px',
            fontWeight: 700,
            cursor: 'pointer',
          }}>
          {alertsEnabled ? 'Alerts ON' : 'Enable Alerts'}
        </button>
      </div>
      <button
        type="button"
        aria-label="Go to my location"
        onClick={centerOnMe}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 86,
          width: 44,
          height: 44,
          borderRadius: 22,
          border: '1px solid #D1D5DB',
          background: '#FFFFFF',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          cursor: 'pointer',
        }}>
        ◎
      </button>
      <div style={{ position: 'absolute', left: 12, bottom: 12, background: '#fff', borderRadius: 8, padding: 8 }}>
        Tap map to drop pin. Click pin for label. Long-press/right-click pin to remove.
      </div>
    </div>
  );
}
