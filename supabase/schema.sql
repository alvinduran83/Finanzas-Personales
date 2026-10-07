-- Ejecutar en Supabase > SQL Editor

create table public.cuentas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null check (char_length(trim(nombre)) between 1 and 60),
  tipo          text not null default 'Ahorro',
  saldo_inicial numeric(14,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- Un usuario no puede repetir el nombre de una cuenta
create unique index cuentas_usuario_nombre_uq
  on public.cuentas (user_id, lower(trim(nombre)));

-- Seguridad por fila: cada usuario solo ve y modifica lo suyo
alter table public.cuentas enable row level security;

create policy "cuentas_select" on public.cuentas
  for select to authenticated using (user_id = auth.uid());
create policy "cuentas_insert" on public.cuentas
  for insert to authenticated with check (user_id = auth.uid());
create policy "cuentas_update" on public.cuentas
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cuentas_delete" on public.cuentas
  for delete to authenticated using (user_id = auth.uid());
