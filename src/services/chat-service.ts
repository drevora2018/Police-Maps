import { RealtimeChannel } from '@supabase/supabase-js';

import { requireSupabase } from '@/lib/supabase';
import { ChatMessage } from '@/types/domain';

const TABLE = 'chat_messages';

export async function listRecentMessages(limit = 100) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function sendMessage(body: string, installationId: string, alias: string) {
  const supabase = requireSupabase();
  const clean = body.trim();
  const cleanAlias = alias.trim();
  if (!clean) {
    throw new Error('Message cannot be empty.');
  }
  if (!cleanAlias) {
    throw new Error('Alias is required.');
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      body: clean,
      alias: cleanAlias,
      installation_id: installationId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export function subscribeToMessages(onInsert: (message: ChatMessage) => void) {
  const supabase = requireSupabase();
  const channel: RealtimeChannel = supabase
    .channel('chat-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE },
      (payload) => onInsert(payload.new as ChatMessage)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
