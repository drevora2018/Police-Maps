import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type PinPayload = {
  pin_id: string;
  lat: number;
  lng: number;
  note: string | null;
  pin_type?: 'police_car' | 'camera';
  location_label?: string | null;
  created_by_installation_id: string;
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = (await req.json()) as PinPayload;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing server env', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: recipients, error } = await supabase
    .from('device_preferences')
    .select('expo_push_token, installation_id')
    .eq('notifications_enabled', true)
    .not('expo_push_token', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const pinLabel = body.pin_type === 'camera' ? 'Camera' : 'Police car';
  const location = body.location_label ? ` at ${body.location_label}` : '';

  const messages = (recipients ?? [])
    .filter(
      (row) =>
        row.expo_push_token &&
        row.installation_id !== body.created_by_installation_id
    )
    .map((row) => ({
      to: row.expo_push_token as string,
      sound: 'default',
      title: `New ${pinLabel} pin`,
      body: body.note ? `${pinLabel}${location}: ${body.note}` : `${pinLabel} pin dropped${location}.`,
      data: {
        type: 'new_pin',
        pin_id: body.pin_id,
        pin_type: body.pin_type ?? 'police_car',
        location_label: body.location_label ?? null,
        lat: body.lat,
        lng: body.lng,
      },
    }));

  if (!messages.length) {
    return new Response(JSON.stringify({ delivered: 0 }), { status: 200 });
  }

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: 502 });
  }

  return new Response(JSON.stringify({ delivered: messages.length }), { status: 200 });
});
