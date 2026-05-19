import { RealtimeChannel } from '@supabase/supabase-js';

import { requireSupabase } from '@/lib/supabase';
import { Pin, PinType } from '@/types/domain';

const TABLE = 'pins';

export async function listActivePins() {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .gt('expires_at', now)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pin[];
}

export async function createPin(params: {
  lat: number;
  lng: number;
  note?: string;
  locationLabel?: string | null;
  pinType: PinType;
  createdByInstallationId: string;
}) {
  const supabase = requireSupabase();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      lat: params.lat,
      lng: params.lng,
      note: params.note ?? null,
      location_label: params.locationLabel ?? null,
      pin_type: params.pinType,
      created_by_installation_id: params.createdByInstallationId,
      expires_at: expiresAt,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Pin;
}

export async function deletePin(pinId: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.from(TABLE).delete().eq('id', pinId);
  if (error) throw error;
}

export function subscribeToPinChanges(onChange: (payload: { eventType: string; new: Pin | null; old: Pin | null }) => void) {
  const supabase = requireSupabase();
  const channel: RealtimeChannel = supabase
    .channel('pins-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      (payload) => {
        onChange({
          eventType: payload.eventType,
          new: (payload.new as Pin | null) ?? null,
          old: (payload.old as Pin | null) ?? null,
        });
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
