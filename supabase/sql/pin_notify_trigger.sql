-- Run after deploying the edge function `pin-notify`.
-- Requires Vault secrets:
--   function_base_url = https://<project-ref>.supabase.co/functions/v1
--   function_anon_key = <your project's anon/publishable key>

create extension if not exists pg_net;

create or replace function public.notify_pin_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  req_id bigint;
begin
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'function_base_url') || '/pin-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'function_anon_key')
    ),
    body := jsonb_build_object(
      'pin_id', new.id,
      'lat', new.lat,
      'lng', new.lng,
      'note', new.note,
      'pin_type', new.pin_type,
      'location_label', new.location_label,
      'created_by_installation_id', new.created_by_installation_id
    )
  ) into req_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_pin_insert on public.pins;
create trigger trg_notify_pin_insert
after insert on public.pins
for each row execute function public.notify_pin_insert();
