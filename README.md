# Police Maps (Expo + Supabase)

Two-tab mobile app:
- `Chat` tab: global realtime chat room
- `Map` tab: interactive map where users drop pins that expire after 24 hours

Push and in-app notifications are sent for new pins, with per-device opt-out.

## Local setup

1. Install dependencies:
```bash
npm install
```

2. Create env file from `.env.example`:
```bash
cp .env.example .env
```

3. Fill:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (Android map tiles)

4. Start:
```bash
npx expo start
```

## Supabase setup

1. Run migration:
- `supabase/migrations/20260518_police_maps_v1.sql`

2. Deploy Edge Function:
- `supabase/functions/pin-notify/index.ts`

3. Create Vault secrets in Supabase SQL editor:
```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'function_base_url');
select vault.create_secret('<your-anon-key>', 'function_anon_key');
```

4. Run notification trigger SQL:
- `supabase/sql/pin_notify_trigger.sql`

## Notes

- Map interactions are intended for iOS/Android. Web renders a fallback message.
- `expo-notifications` requires a development build for full remote push testing.
- Realtime for `pins` and `chat_messages` must be enabled in Supabase publication (`supabase_realtime`).
