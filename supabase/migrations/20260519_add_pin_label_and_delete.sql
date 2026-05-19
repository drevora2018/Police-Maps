alter table public.pins
  add column if not exists location_label text;

drop policy if exists "pins_delete_all" on public.pins;
create policy "pins_delete_all" on public.pins for delete using (true);

