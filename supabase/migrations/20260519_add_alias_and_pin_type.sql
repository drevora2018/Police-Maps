alter table public.chat_messages
  add column if not exists alias text not null default 'Anonymous';

update public.chat_messages
set alias = 'Anonymous'
where alias is null or char_length(trim(alias)) = 0;

alter table public.pins
  add column if not exists pin_type text not null default 'police_car';

update public.pins
set pin_type = 'police_car'
where pin_type is null or pin_type not in ('police_car', 'camera');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pins_pin_type_check'
  ) then
    alter table public.pins
      add constraint pins_pin_type_check check (pin_type in ('police_car', 'camera'));
  end if;
end;
$$;

