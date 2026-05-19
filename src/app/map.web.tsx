import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { createPin, deletePin, listActivePins, subscribeToPinChanges } from '@/services/pins-service';
import { Pin, PinType } from '@/types/domain';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 16;

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
  const [busy, setBusy] = React.useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = React.useState(false);
  const busyRef = React.useRef(false);

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
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          map.setView(coords, FOCUS_ZOOM);
        });
      }

      setPins(initialPins);
    };

    void setup();
    const unsubscribe = subscribeToPinChanges(({ eventType, new: nextPin, old }) => {
      setPins((prev) => {
        if (eventType === 'INSERT' && nextPin) return [nextPin, ...prev.filter((p) => p.id !== nextPin.id)];
        if (eventType === 'UPDATE' && nextPin) return prev.map((p) => (p.id === nextPin.id ? nextPin : p));
        if (eventType === 'DELETE' && old) return prev.filter((p) => p.id !== old.id);
        return prev;
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

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
      marker.bindPopup(`<b>${title}</b><br/>${detail}<br/><button id="rm-${pin.id}">Remove</button>`);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`rm-${pin.id}`);
        if (!btn) return;
        btn.onclick = async () => {
          await deletePin(pin.id);
          setPins((prev) => prev.filter((p) => p.id !== pin.id));
          map.closePopup();
        };
      });

      markersRef.current[pin.id] = marker;
    }
  }, [pins]);

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
      <div style={{ position: 'absolute', right: 12, top: 12, background: '#fff', borderRadius: 8, padding: 8 }}>
        Tap map to drop pin. Click pin for details.
      </div>
    </div>
  );
}
