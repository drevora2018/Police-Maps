export type ThemePreference = 'system' | 'light' | 'dark';
export type PinType = 'police_car' | 'camera';

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  note: string | null;
  location_label: string | null;
  pin_type: PinType;
  created_at: string;
  expires_at: string;
  created_by_installation_id: string;
};

export type ChatMessage = {
  id: string;
  body: string;
  alias: string;
  created_at: string;
  installation_id: string;
};

export type DevicePreference = {
  installation_id: string;
  notifications_enabled: boolean;
  expo_push_token: string | null;
  updated_at: string;
};
